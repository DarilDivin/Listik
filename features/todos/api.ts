// Couche d'accès aux commandes Tauri (le SQL vit côté Rust).
// Tout passe par invoke() — aucune requête SQL dans le webview.
import { invoke } from "@tauri-apps/api/core";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "./types";

/** Événement émis par le backend après chaque mutation (synchro multi-fenêtres). */
export const TODOS_CHANGED = "todos:changed";

export const todosApi = {
  list: () => invoke<Todo[]>("list_todos"),
  listByDate: (date: string) => invoke<Todo[]>("list_todos_by_date", { date }),
  create: (payload: CreateTodoInput) => invoke<Todo>("create_todo", { payload }),
  update: (id: string, payload: UpdateTodoInput) =>
    invoke<Todo>("update_todo", { id, payload }),
  toggle: (id: string) => invoke<Todo>("toggle_todo", { id }),
  remove: (id: string) => invoke<void>("delete_todo", { id }),
  /** Copie (texte/tags/sous-tâches) en gabarit réutilisable — statut/dates remis à zéro. */
  duplicate: (id: string) => invoke<Todo>("duplicate_todo", { id }),
};
