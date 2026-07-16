// Regroupement GTD des tâches pour le planner (façon Things).
// Logique pure (sans React) → réutilisable et testable isolément.
//
// Principe : on ne stocke que le non-dérivable (`someday`, `this_evening`) ;
// Boîte de réception / Quand je peux / Aujourd'hui se DÉDUISENT de la date et
// du rattachement. Cette fonction reste pure : c'est le mur porteur des
// animations de la page (routage par la donnée, jamais par l'interaction).
import type { Todo } from "./types";

export type DateGroupKey =
  | "overdue"
  | "today"
  | "evening"
  | "tomorrow"
  | "upcoming"
  | "inbox"
  | "anytime"
  | "someday"
  | "completed";

export interface TodoGroups {
  /** Planifiées avant aujourd'hui et non terminées. */
  overdue: Todo[];
  /** Planifiées aujourd'hui (hors « Ce soir »). */
  today: Todo[];
  /** Planifiées aujourd'hui et marquées « Ce soir ». */
  evening: Todo[];
  tomorrow: Todo[];
  /** Au-delà de demain. */
  upcoming: Todo[];
  /** Capturées et non triées : sans date ni rattachement. */
  inbox: Todo[];
  /** Triées mais sans date : disponibles quand on veut. */
  anytime: Todo[];
  /** Rangées explicitement à « Un jour ». */
  someday: Todo[];
  /** Terminées (tous horizons confondus) — alimente le Journal. */
  completed: Todo[];
}

/** Les vues du rail du Planificateur (navigation façon Things). */
export type PlannerView =
  | "inbox"
  | "today"
  | "upcoming"
  | "anytime"
  | "someday"
  | "journal";

export const PLANNER_VIEWS: { id: PlannerView; label: string }[] = [
  { id: "inbox", label: "Boîte de réception" },
  { id: "today", label: "Aujourd'hui" },
  { id: "upcoming", label: "À venir" },
  { id: "anytime", label: "Quand je peux" },
  { id: "someday", label: "Un jour" },
  { id: "journal", label: "Journal" },
];

/** Groupes composant chaque vue, dans l'ordre d'affichage. */
export const VIEW_SECTIONS: Record<PlannerView, DateGroupKey[]> = {
  inbox: ["inbox"],
  today: ["overdue", "today", "evening"],
  upcoming: ["tomorrow", "upcoming"],
  anytime: ["anytime"],
  someday: ["someday"],
  journal: ["completed"],
};

/**
 * Une tâche est « triée » dès qu'elle a un rattachement — elle a donc quitté la
 * boîte de réception. Pont transitoire : tant que la réconciliation
 * `list → projets` n'a pas eu lieu (Phase G), la liste plate fait foi au même
 * titre qu'un projet, sinon toutes les tâches existantes retomberaient en
 * boîte de réception.
 */
function isTriaged(todo: Todo): boolean {
  return todo.project_id !== null || todo.list !== null;
}

/**
 * Répartit les tâches par groupe GTD à partir de `scheduled_for` (comparaison
 * de chaînes `YYYY-MM-DD`, sûre lexicographiquement), du drapeau `someday` et
 * du rattachement. Les « cancelled » sont ignorées ; les « completed » vont
 * dans `completed` (Journal), quel que soit leur horizon.
 */
export function groupTodosByDate(
  todos: Todo[],
  today: string,
  tomorrow: string,
): TodoGroups {
  const groups: TodoGroups = {
    overdue: [],
    today: [],
    evening: [],
    tomorrow: [],
    upcoming: [],
    inbox: [],
    anytime: [],
    someday: [],
    completed: [],
  };

  for (const todo of todos) {
    if (todo.status === "completed") {
      groups.completed.push(todo);
      continue;
    }
    if (todo.status === "cancelled") continue;

    // « Un jour » est un choix explicite : il prime sur tout horizon daté.
    if (todo.someday) {
      groups.someday.push(todo);
      continue;
    }

    const date = todo.scheduled_for;
    if (!date) {
      (isTriaged(todo) ? groups.anytime : groups.inbox).push(todo);
    } else if (date < today) {
      groups.overdue.push(todo);
    } else if (date === today) {
      // « Ce soir » n'a de sens que pour la journée en cours.
      (todo.this_evening ? groups.evening : groups.today).push(todo);
    } else if (date === tomorrow) {
      groups.tomorrow.push(todo);
    } else {
      groups.upcoming.push(todo);
    }
  }

  return groups;
}

/** Nombre de tâches affichées par une vue (somme de ses groupes). */
export function countForView(groups: TodoGroups, view: PlannerView): number {
  return VIEW_SECTIONS[view].reduce((n, key) => n + groups[key].length, 0);
}
