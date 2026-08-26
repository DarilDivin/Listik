import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { todosApi } from "./api";
import { nextOccurrence } from "./recurrence";
import { pickForRestore, restorePayloadForToggle } from "./undo";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "./types";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate } from "@/lib/date";

type TodoUpdater = (todos: Todo[]) => Todo[];

const UNDO_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Undo générique (Phase O — un seul mécanisme pour toute mutation réversible :
// suppression, toggle, update, actions par lot). Un seul emplacement actif
// (décision : undo « à un pas », pas d'historique) : toute nouvelle action
// réversible ferme le toast en attente et le remplace, quelle que soit sa
// nature — avant l'unification, la suppression vivait dans son propre système
// (son propre toast, sa propre Map de minuteurs) et pouvait rester annulable
// EN MÊME TEMPS qu'un toggle/update venait d'armer le sien : deux toasts
// « Annuler » actifs, Ctrl+Z ne rejouant que l'un des deux. Un seul emplacement
// élimine ce cas.
//
// Les deux NATURES de restauration restent différentes en interne (légitime :
// ce sont deux opérations différentes), seul le SLOT qui les arme est commun :
// - suppression : la ligne est retirée du cache tout de suite, mais l'écriture
//   côté backend est différée de `UNDO_DELAY_MS` — annuler = `clearTimeout` +
//   réinsertion, sans jamais toucher le serveur. Recréer une tâche VRAIMENT
//   supprimée impliquerait de reconstruire id/tags/sous-tâches côté serveur ;
//   retarder l'écriture reste strictement plus simple.
// - toggle/update : déjà committées (backend appelé, `todos:changed` émis) au
//   moment où le toast s'affiche — annuler rejoue une VRAIE seconde mutation
//   restaurant les anciennes valeurs.
// ---------------------------------------------------------------------------

interface UndoSlot {
  id: number;
  toastId: string | number;
  run: () => Promise<void>;
}

let activeUndo: UndoSlot | null = null;
let undoCounter = 0;

/**
 * Rejoue l'undo en attente, s'il y en a un — utilisé par le raccourci
 * Ctrl/Cmd+Z. Couvre toute mutation réversible, suppression comprise
 * (unifiées sur ce même emplacement, Phase O).
 */
export function triggerPendingUndo(): void {
  const slot = activeUndo;
  if (!slot) return;
  activeUndo = null;
  toast.dismiss(slot.toastId);
  void slot.run();
}

/**
 * Arme l'undo générique : ferme le toast précédent s'il y en avait un (un
 * seul emplacement actif), affiche le nouveau. La garde par `id` protège
 * contre une closure de toast PÉRIMÉE : si une action B remplace l'undo de A
 * pendant que le toast de A est encore visible (jusqu'à 5 s), cliquer sur
 * « Annuler » de A ne doit rien faire — sans cette garde, on aurait un undo à
 * deux niveaux qui viole la règle « à un pas ».
 */
function armUndo(message: string, run: () => Promise<void>): void {
  if (activeUndo) toast.dismiss(activeUndo.toastId);
  const id = ++undoCounter;
  const clearIfCurrent = () => {
    if (activeUndo?.id === id) activeUndo = null;
  };
  const toastId = toast(message, {
    duration: UNDO_DELAY_MS,
    action: {
      label: "Annuler",
      onClick: () => {
        if (activeUndo?.id !== id) return; // périmé : remplacé depuis
        activeUndo = null;
        void run();
      },
    },
    onDismiss: clearIfCurrent,
    onAutoClose: clearIfCurrent,
  });
  activeUndo = { id, toastId, run };
}

/**
 * Mutations partagées (create / toggle / delete / update) avec mise à jour
 * optimiste. Le backend émet `todos:changed` après écriture : `useTodosSync`
 * se charge alors de la revalidation. On ne revalide ici qu'en cas d'erreur
 * (rollback).
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

  const getCached = (id: string): Todo | undefined =>
    ((cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? []).find(
      (t) => t.id === id,
    );

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
      recur_interval: payload.recur_interval ?? 1,
      recur_weekday: payload.recur_weekday ?? null,
      recur_weekdays: payload.recur_weekdays ?? null,
      recur_setpos: payload.recur_setpos ?? null,
      recur_mode: payload.recur_mode ?? "fixed",
      scheduled_for: payload.scheduled_for ?? null,
      due_date: payload.due_date ?? null,
      remind_at: payload.remind_at ?? null,
      project_id: payload.project_id ?? null,
      area_id: payload.area_id ?? null,
      heading_id: payload.heading_id ?? null,
      this_evening: payload.this_evening ?? false,
      someday: payload.someday ?? false,
      created_at: now,
      updated_at: now,
      sub_tasks: [],
      // Rien n'est lié à la création : les tags passent par `set_todo_tags`.
      tags: [],
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
    // Pas d'undo à la création : supprimer EST l'undo (toast de `deleteTodo`).
  };

  /**
   * Bascule le statut d'une tâche. `skipUndo` : utilisé en interne par
   * `toggleManyTodos` (un seul toast de lot, pas un par tâche) et par la
   * restauration elle-même (jamais d'undo-de-l'undo).
   */
  const toggleTodo = async (
    id: string,
    options?: { skipUndo?: boolean },
  ): Promise<void> => {
    const before = getCached(id);
    const reschedules =
      !!before && before.recurrence !== "none" && before.status === "pending";
    const now = new Date().toISOString();

    if (reschedules && before) {
      // Tâche récurrente cochée → reportée à la prochaine occurrence.
      // L'échéance décale du MÊME delta (« planifiée lundi, due vendredi »
      // garde ses 4 jours d'écart) — jamais inventée si absente. Miroir du
      // comportement backend (db::toggle).
      const next = nextOccurrence(before.scheduled_for, before);
      let nextDue = before.due_date;
      if (next && before.due_date && before.scheduled_for) {
        const delta = Date.parse(next) - Date.parse(before.scheduled_for);
        nextDue = new Date(Date.parse(before.due_date) + delta)
          .toISOString()
          .slice(0, 10);
      }
      patchCaches((todos) =>
        todos.map((t) =>
          t.id === id
            ? { ...t, scheduled_for: next, due_date: nextDue, updated_at: now }
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
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
      await revalidate();
      throw error;
    }

    if (options?.skipUndo || !before) return;

    // Armé APRÈS résolution de l'IPC : latence locale imperceptible, et ça
    // élimine le cas « undo armé sur un état déjà annulé par une erreur ».
    const restore = restorePayloadForToggle(before);
    const message = reschedules
      ? "Tâche reportée"
      : before.status === "completed"
        ? "Tâche rouverte"
        : "Tâche terminée";
    armUndo(message, () => toggleRestoreUpdate(id, restore));
  };

  /** Applique un payload de restauration sans jamais ré-armer d'undo. */
  const toggleRestoreUpdate = (id: string, payload: UpdateTodoInput) =>
    updateTodo(id, payload, { skipUndo: true });

  const deleteTodo = async (id: string): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const removed = all.find((t) => t.id === id) ?? null;

    patchCaches((todos) => todos.filter((todo) => todo.id !== id));

    let committed = false;
    const commit = async () => {
      committed = true;
      try {
        await todosApi.remove(id);
      } catch {
        toast.error("Erreur lors de la suppression");
        await revalidate();
      }
    };
    const timer = setTimeout(commit, UNDO_DELAY_MS);

    armUndo("Tâche supprimée", async () => {
      if (committed) return; // trop tard : le délai s'est déjà écoulé
      clearTimeout(timer);
      if (removed) patchCaches((todos) => [removed, ...todos]);
    });
  };

  /**
   * Supprime plusieurs tâches (action par lot) : UN SEUL toast restaure
   * TOUTES les tâches d'un coup — même principe que `toggleManyTodos`/
   * `updateManyTodos`, plus la mécanique de délai propre à la suppression.
   */
  const deleteManyTodos = async (ids: string[]): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const removed = ids
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Todo => t !== undefined);
    if (removed.length === 0) return;

    const removedIds = new Set(removed.map((t) => t.id));
    patchCaches((todos) => todos.filter((t) => !removedIds.has(t.id)));

    let committed = false;
    const commit = async () => {
      committed = true;
      const results = await Promise.allSettled(
        removed.map((t) => todosApi.remove(t.id)),
      );
      if (results.some((r) => r.status === "rejected")) {
        toast.error("Erreur lors de la suppression");
        await revalidate();
      }
    };
    const timer = setTimeout(commit, UNDO_DELAY_MS);

    const n = removed.length;
    armUndo(`${n} tâche${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}`, async () => {
      if (committed) return;
      clearTimeout(timer);
      patchCaches((todos) => [...removed, ...todos]);
    });
  };

  /**
   * Met à jour une tâche. Par défaut, capture les valeurs D'AVANT pour les
   * seules clés du payload et arme un undo générique — c'est ce qui rend
   * réversibles tout à la fois : édition dans le panneau de détail, glisser
   * une tâche sur le rail (replanifier/affecter), et les raccourcis du menu
   * contextuel. `skipUndo` : restauration elle-même, ou appel interne d'une
   * fonction « par lot » qui arme SON PROPRE undo groupé.
   */
  const updateTodo = async (
    id: string,
    payload: UpdateTodoInput,
    options?: { skipUndo?: boolean; undoMessage?: string },
  ): Promise<void> => {
    const before = getCached(id);

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

    if (options?.skipUndo || !before) return;

    const keys = Object.keys(payload) as (keyof UpdateTodoInput)[];
    if (keys.length === 0) return;
    const restore = pickForRestore(before, keys);
    armUndo(options?.undoMessage ?? "Modifié", () =>
      updateTodo(id, restore, { skipUndo: true }),
    );
  };

  /**
   * Bascule plusieurs tâches (action par lot, K1c « Terminer ») : UN SEUL
   * toast restaure chacune à sa propre valeur d'avant (décision : le lot est
   * une unité, pas N annulations indépendantes). Ne touche que les tâches
   * encore en cours (cocher une tâche déjà terminée la rouvrirait).
   */
  const toggleManyTodos = async (ids: string[]): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const targets = ids
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Todo => t !== undefined)
      .filter((t) => t.status === "pending");
    if (targets.length === 0) return;

    await Promise.allSettled(targets.map((t) => toggleTodo(t.id, { skipUndo: true })));

    const n = targets.length;
    armUndo(`${n} tâche${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""}`, async () => {
      const results = await Promise.allSettled(
        targets.map((t) => toggleRestoreUpdate(t.id, restorePayloadForToggle(t))),
      );
      if (results.some((r) => r.status === "rejected")) await revalidate();
    });
  };

  /**
   * Applique le MÊME payload à plusieurs tâches (action par lot, K1c). Un
   * seul toast restaure chacune à sa propre valeur d'avant — les tâches
   * peuvent avoir des dates différentes avant une replanification groupée.
   */
  const updateManyTodos = async (
    ids: string[],
    payload: UpdateTodoInput,
  ): Promise<void> => {
    const all = (cache.get(SWR_KEYS.ALL_TODOS)?.data as Todo[] | undefined) ?? [];
    const keys = Object.keys(payload) as (keyof UpdateTodoInput)[];
    const snapshots = ids
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Todo => Boolean(t))
      .map((t) => ({ id: t.id, restore: pickForRestore(t, keys) }));
    if (snapshots.length === 0) return;

    await Promise.allSettled(ids.map((id) => updateTodo(id, payload, { skipUndo: true })));

    const n = snapshots.length;
    armUndo(`${n} tâche${n > 1 ? "s" : ""} modifiée${n > 1 ? "s" : ""}`, async () => {
      const results = await Promise.allSettled(
        snapshots.map((s) => updateTodo(s.id, s.restore, { skipUndo: true })),
      );
      if (results.some((r) => r.status === "rejected")) await revalidate();
    });
  };

  /**
   * Duplique une tâche (menu contextuel, Phase L) : « gabarit réutilisable » —
   * texte/tags/sous-tâches copiés, statut/dates remis à zéro (voir
   * `db::duplicate_todo_tx`). Pas d'undo dédié : supprimer la copie EST
   * l'undo, même classe que la création.
   */
  const duplicateTodo = async (id: string): Promise<Todo> => {
    try {
      const copy = await todosApi.duplicate(id);
      toast.success("Tâche dupliquée");
      return copy;
    } catch (error) {
      toast.error("Erreur lors de la duplication");
      throw error;
    }
  };

  return {
    createTodo,
    toggleTodo,
    deleteTodo,
    deleteManyTodos,
    updateTodo,
    toggleManyTodos,
    updateManyTodos,
    duplicateTodo,
  };
}
