import type { Todo } from "./types";
import { PRIORITY_ORDER } from "./priority";

/**
 * Tri d'affichage unifié : tâches en attente d'abord, puis par priorité,
 * puis par date de création (plus récent en premier).
 */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "pending") return -1;
      if (b.status === "pending") return 1;
    }

    const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDelta !== 0) return priorityDelta;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
