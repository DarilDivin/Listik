// Couche d'accès aux commandes Tauri des notes (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type { CreateNoteInput, Note, UpdateNoteInput } from "./types";

/** Événement émis par le backend après chaque mutation de note. */
export const NOTES_CHANGED = "notes:changed";

export const notesApi = {
  list: () => invoke<Note[]>("list_notes"),
  search: (query: string) => invoke<Note[]>("search_notes", { query }),
  create: (payload: CreateNoteInput) => invoke<Note>("create_note", { payload }),
  update: (id: string, payload: UpdateNoteInput) =>
    invoke<Note>("update_note", { id, payload }),
  remove: (id: string) => invoke<void>("delete_note", { id }),
};
