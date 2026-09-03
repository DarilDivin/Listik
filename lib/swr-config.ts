// Clés SWR standardisées pour les todos.
// La revalidation croisée entre fenêtres passe par l'événement
// `todos:changed` (voir features/todos/useTodosSync.ts).
export const SWR_KEYS = {
  ALL_TODOS: "todos/all",
  TODAY_TODOS: "todos/today",
  TODOS_BY_DATE: (date: string) => `todos/date/${date}`,
  TODOS_BY_STATUS: (status: string) => `todos/status/${status}`,
  ALL_NOTES: "notes/all",
  JOURNAL_DAY: (day: string) => `journal/day/${day}`,
  JOURNAL_UPCOMING: "journal/upcoming",
  JOURNAL_MONTH: (month: string) => `journal/month/${month}`,
  /**
   * La recherche est SOUS `journal/` comme les autres : `useJournalSync`
   * revalide toutes les clés de ce préfixe après une écriture, et une
   * liste de résultats périmée est un piège — on cliquerait sur un
   * passage qui n'existe plus.
   */
  JOURNAL_SEARCH: (query: string) => `journal/search/${query}`,
  ALL_PROJECTS: "projects/all",
  ALL_AREAS: "projects/areas",
  ALL_TAGS: "tags/all",
  /** Sous le préfixe `todos/` : revalidé par `todos:changed` (useTodosSync). */
  ORDERINGS: "todos/orderings",
  SETTINGS: "settings",
} as const;
