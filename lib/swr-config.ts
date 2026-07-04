// Clés SWR standardisées pour les todos.
// La revalidation croisée entre fenêtres passe par l'événement
// `todos:changed` (voir features/todos/useTodosSync.ts).
export const SWR_KEYS = {
  ALL_TODOS: "todos/all",
  TODAY_TODOS: "todos/today",
  TODOS_BY_DATE: (date: string) => `todos/date/${date}`,
  TODOS_BY_STATUS: (status: string) => `todos/status/${status}`,
  ALL_NOTES: "notes/all",
  SETTINGS: "settings",
} as const;
