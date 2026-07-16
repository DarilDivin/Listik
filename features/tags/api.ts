// Couche d'accès aux commandes Tauri des tags (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type { CreateTagInput, Tag, UpdateTagInput } from "./types";
import type { Todo } from "@/features/todos/types";

/** Émis par le backend après toute mutation de tag. */
export const TAGS_CHANGED = "tags:changed";

export const tagsApi = {
  list: () => invoke<Tag[]>("list_tags"),
  /** Get-or-create : renvoie le tag existant si le nom existe déjà (NOCASE). */
  create: (payload: CreateTagInput) => invoke<Tag>("create_tag", { payload }),
  update: (id: string, payload: UpdateTagInput) =>
    invoke<Tag>("update_tag", { id, payload }),
  remove: (id: string) => invoke<void>("delete_tag", { id }),
  /** Remplace l'intégralité des tags d'une tâche. */
  setForTodo: (id: string, tagIds: string[]) =>
    invoke<Todo>("set_todo_tags", { id, tagIds }),
};
