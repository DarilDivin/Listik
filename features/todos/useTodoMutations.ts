import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { todosApi } from "./api";
import { nextOccurrence } from "./recurrence";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "./types";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate } from "@/lib/date";

type TodoUpdater = (todos: Todo[]) => Todo[];

const UNDO_DELAY_MS = 5000;
// Suppressions différées (id → minuteur), partagé entre tous les appels du
// hook : la suppression réelle n'est déclenchée qu'après le délai, sauf
// annulation via le toast. Si l'app se ferme entre-temps, rien n'est perdu
// côté base — seul le minuteur est perdu, la tâche réapparaîtra au rechargement.
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Mutations partagées (create / toggle / delete) avec mise à jour optimiste.
 * Le backend émet `todos:changed` après écriture : `useTodosSync` se charge
 * alors de la revalidation. On ne revalide ici qu'en cas d'erreur (rollback).
 */
export function useTodoMutations() {
  const { mutate, cache } = useSWRConfig();

  const patchCaches = (updater: TodoUpdater) => {
    mutate<Todo[]>(SWR_KEYS.ALL_TODOS, (current = []) => updater(current), false);
    mutate<Todo[]>(SWR_KEYS.TODAY_TODOS, (current = []) => updater(current), false);
  };

  // Resynchronise depuis la base (utilisé pour le rollback sur erreur).
  const revalidate = () =>
    mutate((key) => typeof key === "string" && key.startsWith("todos"));

  const createTodo = async (payload: CreateTodoInput): Promise<Todo> => {
    const now = new Date().toISOString();
    const optimistic: Todo = {
      id: `temp-${Date.now()}`,
      text: payload.text,
      note: payload.note ?? null,
      list: payload.list ?? null,
      status: "pending",
      priority: payload.priority ?? "normal",
      recurrence: payload.recurrence ?? "none",
      scheduled_for: payload.scheduled_for ?? null,
      due_date: payload.due_date ?? null,
      remind_at: payload.remind_at ?? null,
      created_at: now,
      updated_at: now,
    };

    mutate<Todo[]>(SWR_KEYS.ALL_TODOS, (current = []) => [optimistic, ...current], false);
    if (optimistic.scheduled_for === todayLocalISODate()) {
      mutate<Todo[]>(SWR_KEYS.TODAY_TODOS, (current = []) => [optimistic, ...current], false);
    }

    try {
      return await todosApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création");
      await revalidate();
      throw error;
    }
  };

  const toggleTodo = async (id: string): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const todo = all.find((t) => t.id === id);
    const reschedules =
      !!todo && todo.recurrence !== "none" && todo.status === "pending";
    const now = new Date().toISOString();

    if (reschedules && todo) {
      // Tâche récurrente cochée → reportée à la prochaine occurrence.
      const next = nextOccurrence(todo.scheduled_for, todo.recurrence);
      patchCaches((todos) =>
        todos.map((t) =>
          t.id === id
            ? { ...t, scheduled_for: next, due_date: next, updated_at: now }
            : t,
        ),
      );
    } else {
      patchCaches((todos) =>
        todos.map((t) =>
          t.id === id
            ? {
                ...t,
                status: t.status === "completed" ? "pending" : "completed",
                updated_at: now,
              }
            : t,
        ),
      );
    }

    try {
      await todosApi.toggle(id);
      toast.success(reschedules ? "Tâche reportée" : "Tâche mise à jour");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
      await revalidate();
      throw error;
    }
  };

  const deleteTodo = async (id: string): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const removed = all.find((t) => t.id === id) ?? null;

    patchCaches((todos) => todos.filter((todo) => todo.id !== id));

    const commit = async () => {
      pendingDeletes.delete(id);
      try {
        await todosApi.remove(id);
      } catch {
        toast.error("Erreur lors de la suppression");
        await revalidate();
      }
    };

    pendingDeletes.set(id, setTimeout(commit, UNDO_DELAY_MS));

    toast("Tâche supprimée", {
      duration: UNDO_DELAY_MS,
      action: {
        label: "Annuler",
        onClick: () => {
          const timer = pendingDeletes.get(id);
          if (!timer) return; // déjà commitée, trop tard pour annuler
          clearTimeout(timer);
          pendingDeletes.delete(id);
          if (removed) patchCaches((todos) => [removed, ...todos]);
        },
      },
    });
  };

  const updateTodo = async (
    id: string,
    payload: UpdateTodoInput,
  ): Promise<void> => {
    patchCaches((todos) =>
      todos.map((todo) =>
        todo.id === id
          ? { ...todo, ...payload, updated_at: new Date().toISOString() }
          : todo,
      ),
    );

    try {
      await todosApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors de la modification");
      await revalidate();
      throw error;
    }
  };

  return { createTodo, toggleTodo, deleteTodo, updateTodo };
}
