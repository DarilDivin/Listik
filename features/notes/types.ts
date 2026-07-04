// Type de SORTIE généré depuis Rust (src-tauri/src/models/note.rs) via ts-rs.
// → source de vérité ; régénérer avec `cargo test` (ne pas éditer ./generated).
export type { Note } from "./generated/Note";

// Types d'ENTRÉE (construits côté frontend), écrits à la main.
export interface CreateNoteInput {
  title?: string;
  content?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  pinned?: boolean;
}
