import useSWR from "swr";
import { useMemo } from "react";
import { toast } from "sonner";
import { todosApi } from "@/features/todos/api";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { sortTodos } from "@/features/todos/sort";
import type { CreateTodoInput, Priority, TodoStatus } from "@/features/todos/types";
import type { SmartTaskData } from "@/features/todos/useTaskMode";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";

export const usePlannerTodos = () => {
  useTodosSync();

  const {
    data: rawTodos = [],
    error,
    isLoading: loading,
    mutate: refetch,
  } = useSWR(SWR_KEYS.ALL_TODOS, () => todosApi.list(), {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const todos = useMemo(() => sortTodos(rawTodos), [rawTodos]);

  const { createTodo, toggleTodo, deleteTodo, updateTodo } = useTodoMutations();

  /**
   * Crée une tâche depuis la saisie intelligente. `defaults` porte les défauts
   * de la vue courante (capturer dans Aujourd'hui planifie aujourd'hui, dans
   * Un jour range à « Un jour »…) : ils ne s'appliquent QUE si aucune date n'a
   * été reconnue dans le texte — ce que l'utilisateur écrit prime toujours.
   */
  const createTodoFromSmart = async (
    taskData: SmartTaskData,
    defaults?: Partial<CreateTodoInput>,
  ) => {
    const dueDate = taskData.dueDate ? toLocalISODate(taskData.dueDate) : null;
    const payload: CreateTodoInput = {
      text: taskData.text,
      note: taskData.note ?? null,
      list: taskData.list ?? null,
      priority: taskData.priority ?? "normal",
      scheduled_for: dueDate,
      due_date: dueDate,
      ...(dueDate ? {} : defaults),
    };
    const result = await createTodo(payload);
    // Une tâche sans date n'est pas « planifiée » : elle est capturée, à trier.
    toast.success(
      payload.scheduled_for ? "Tâche planifiée" : "Tâche capturée",
    );
    return result;
  };

  // Sélecteurs dérivés (mémorisés)
  const getTodosByStatus = useMemo(
    () => (status: TodoStatus) => todos.filter((todo) => todo.status === status),
    [todos],
  );

  const getTodosByDate = useMemo(
    () => (date: string) => todos.filter((todo) => todo.scheduled_for === date),
    [todos],
  );

  const getTodosByPriority = useMemo(
    () => (priority: Priority) => todos.filter((todo) => todo.priority === priority),
    [todos],
  );

  const getTodayTodos = useMemo(() => {
    const today = todayLocalISODate();
    return todos.filter((todo) => todo.scheduled_for === today);
  }, [todos]);

  const getOverdueTodos = useMemo(() => {
    const today = todayLocalISODate();
    return todos.filter(
      (todo) => todo.due_date && todo.due_date < today && todo.status === "pending",
    );
  }, [todos]);

  // Listes/projets distincts actuellement utilisés (triés).
  const lists = useMemo(() => {
    const set = new Set<string>();
    for (const t of todos) if (t.list) set.add(t.list);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [todos]);

  return {
    todos,
    loading,
    error: error?.message ?? null,
    createTodoFromSmart,
    toggleTodo,
    deleteTodo,
    updateTodo,
    getTodosByStatus,
    getTodosByDate,
    getTodosByPriority,
    getTodayTodos,
    getOverdueTodos,
    lists,
    refetch,
  };
};
