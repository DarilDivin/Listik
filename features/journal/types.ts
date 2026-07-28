// Type de SORTIE généré depuis Rust (src-tauri/src/models/journal_entry.rs)
// via ts-rs. → source de vérité ; régénérer avec `cargo test` (ne pas éditer
// ./generated).
export type { JournalEntry } from "./generated/JournalEntry";

// Types d'ENTRÉE (construits côté frontend), écrits à la main.
export interface CreateJournalEntryInput {
  /** Jour d'appartenance de la page (YYYY-MM-DD), toujours fourni. */
  target_day: string;
  content: string;
}

export interface UpdateJournalEntryInput {
  target_day?: string;
  content?: string;
}
