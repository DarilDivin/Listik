// Regroupement temporel des tâches pour le planner.
// Logique pure (sans React) → réutilisable et testable isolément.
import type { Todo } from "./types";

export type DateGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "upcoming"
  | "someday";

export interface TodoGroups {
  /** Planifiées avant aujourd'hui et non terminées. */
  overdue: Todo[];
  today: Todo[];
  tomorrow: Todo[];
  /** Au-delà de demain. */
  upcoming: Todo[];
  /** Sans date planifiée. */
  someday: Todo[];
  /** Terminées (tous horizons confondus). */
  completed: Todo[];
}

/** Ordre d'affichage des groupes actifs + libellés. */
export const ACTIVE_GROUPS: { key: DateGroupKey; label: string }[] = [
  { key: "overdue", label: "En retard" },
  { key: "today", label: "Aujourd'hui" },
  { key: "tomorrow", label: "Demain" },
  { key: "upcoming", label: "À venir" },
  { key: "someday", label: "Sans date" },
];

/**
 * Répartit les tâches par horizon temporel à partir de `scheduled_for`
 * (comparaison de chaînes `YYYY-MM-DD`, sûre lexicographiquement).
 * Les tâches « cancelled » sont ignorées ; les « completed » vont dans `completed`.
 */
export function groupTodosByDate(
  todos: Todo[],
  today: string,
  tomorrow: string,
): TodoGroups {
  const groups: TodoGroups = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    someday: [],
    completed: [],
  };

  for (const todo of todos) {
    if (todo.status === "completed") {
      groups.completed.push(todo);
      continue;
    }
    if (todo.status === "cancelled") continue;

    const date = todo.scheduled_for;
    if (!date) groups.someday.push(todo);
    else if (date < today) groups.overdue.push(todo);
    else if (date === today) groups.today.push(todo);
    else if (date === tomorrow) groups.tomorrow.push(todo);
    else groups.upcoming.push(todo);
  }

  return groups;
}
