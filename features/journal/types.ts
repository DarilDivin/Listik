// Type de SORTIE généré depuis Rust (src-tauri/src/models/journal_entry.rs)
// via ts-rs. → source de vérité ; régénérer avec `cargo test` (ne pas éditer
// ./generated).
export type { JournalEntry } from "./generated/JournalEntry";
export type { JournalDayCount } from "./generated/JournalDayCount";
export type { JournalHit } from "./generated/JournalHit";
export type { JournalPiece } from "./generated/JournalPiece";

// Types d'ENTRÉE (construits côté frontend), écrits à la main.
export interface CreateJournalEntryInput {
  /** Jour d'appartenance de la page (YYYY-MM-DD), toujours fourni. */
  target_day: string;
  content: string;
  /**
   * Moment d'ecriture. Absent = resolu par le serveur, et c'est le cas normal.
   *
   * Fourni dans un seul cas : la SCISSION d'un bloc. Le texte qui suit le
   * curseur n'est pas une ecriture nouvelle, c'est la moitie d'un passage deja
   * ecrit — il herite donc de l'heure de son origine, sinon couper le bloc de
   * 8 h a 14 h enverrait sa seconde moitie en bas de la page.
   */
  written_at?: string;
}

export interface UpdateJournalEntryInput {
  target_day?: string;
  content?: string;
}
