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

/**
 * Ce que le rail a sélectionné : une vue GTD, un projet, ou un domaine.
 * Union discriminée tenue en page (état React) plutôt que des routes Next :
 * le routage est piloté par la donnée — c'est ce qui permet aux sections de
 * morpher au lieu d'être démontées — et l'app est exportée en statique.
 */
export type PlannerSelection =
  | { kind: "view"; view: PlannerView }
  | { kind: "project"; id: string }
  | { kind: "area"; id: string };

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
 * Une tâche est « triée » dès qu'elle a un rattachement (projet, ou domaine
 * directement) — elle a donc quitté la boîte de réception.
 *
 * `todo.list` est un **filet de sécurité**, pas un chemin normal : la colonne
 * héritée n'est plus jamais écrite depuis la Phase G, et la réconciliation au
 * démarrage la convertit en projet. On la garde tant que la colonne existe,
 * car si la réconciliation échouait, la retirer viderait TOUT le backlog trié
 * de l'utilisateur dans la boîte de réception. Avec elle, une tâche oubliée
 * dégrade simplement vers « Quand je peux ».
 */
function isTriaged(todo: Todo): boolean {
  return (
    todo.project_id !== null || todo.area_id !== null || todo.list !== null
  );
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

    // « Un jour » est un choix explicite : il prime sur tout horizon daté —
    // y compris une échéance atteinte (le badge J+n reste visible dans la
    // liste, l'échéance n'est donc pas enterrée en silence).
    if (todo.someday) {
      groups.someday.push(todo);
      continue;
    }

    const date = todo.scheduled_for;

    // Échéance atteinte → la tâche REMONTE, quelle que soit sa planification
    // (nulle ou future) : une deadline qui arrive force la visibilité, comme
    // dans Things. Dépassée = « En retard » (l'en-tête honnête, cohérent avec
    // le badge J+n) ; atteinte aujourd'hui = « Aujourd'hui », en respectant le
    // découpage « Ce soir » si la tâche y était rangée.
    if (todo.due_date && todo.due_date <= today) {
      if (todo.due_date < today) {
        groups.overdue.push(todo);
      } else {
        (todo.this_evening && date === today
          ? groups.evening
          : groups.today
        ).push(todo);
      }
      continue;
    }

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

// ---------------------------------------------------------------------------
// Projets & domaines — filtres directs, PAS des groupes GTD
// ---------------------------------------------------------------------------
//
// Un projet n'est pas un horizon temporel : une tâche datée doit apparaître à
// la fois dans « Aujourd'hui » ET dans son projet. On filtre donc directement
// sur le rattachement, sans jamais passer par les buckets de `groupTodosByDate`.

/** Tâches d'un projet (annulées exclues), terminées comprises. */
export function tasksOfProject(todos: Todo[], projectId: string): Todo[] {
  return todos.filter(
    (t) => t.project_id === projectId && t.status !== "cancelled",
  );
}

/** Tâches rangées directement dans un domaine (sans projet intermédiaire). */
export function tasksOfArea(todos: Todo[], areaId: string): Todo[] {
  return todos.filter((t) => t.area_id === areaId && t.status !== "cancelled");
}

/** Progression d'un projet : terminées / total (alimente l'anneau). */
export function projectProgress(
  todos: Todo[],
  projectId: string,
): { done: number; total: number } {
  const items = tasksOfProject(todos, projectId);
  return {
    done: items.filter((t) => t.status === "completed").length,
    total: items.length,
  };
}
