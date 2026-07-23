// Clés SWR standardisées pour les todos.
// La revalidation croisée entre fenêtres passe par l'événement
// `todos:changed` (voir features/todos/useTodosSync.ts).
export const SWR_KEYS = {
  ALL_TODOS: "todos/all",
  TODAY_TODOS: "todos/today",
  TODOS_BY_DATE: (date: string) => `todos/date/${date}`,
  TODOS_BY_STATUS: (status: string) => `todos/status/${status}`,
  ALL_NOTES: "notes/all",
  ALL_PROJECTS: "projects/all",
  ALL_AREAS: "projects/areas",
  ALL_TAGS: "tags/all",
  /** Sous le préfixe `todos/` : revalidé par `todos:changed` (useTodosSync). */
  ORDERINGS: "todos/orderings",
  SETTINGS: "settings",
} as const;
