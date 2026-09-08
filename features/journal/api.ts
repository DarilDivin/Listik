// Couche d'accès aux commandes Tauri du Journal (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type {
  CreateJournalEntryInput,
  JournalDayCount,
  JournalEntry,
  JournalExport,
  JournalHit,
  JournalPiece,
  UpdateJournalEntryInput,
} from "./types";

/**
 * Ce qui encadre les occurrences dans un extrait — les mêmes deux caractères
 * que `db::MARQUE_DEBUT`/`MARQUE_FIN` côté Rust. Deux caractères qu'on
 * n'écrit pas dans un journal, donc sans risque de les confondre avec du texte.
 */
export const MARQUE_DEBUT = "┆";
export const MARQUE_FIN = "┇";

/** Événement émis par le backend après chaque mutation de bloc Journal. */
export const JOURNAL_CHANGED = "journal:changed";

export const journalApi = {
  listForDay: (day: string) =>
    invoke<JournalEntry[]>("list_journal_entries_for_day", { day }),
  listUpcoming: (afterDay: string) =>
    invoke<JournalEntry[]>("list_upcoming_journal_entries", { afterDay }),
  /** Blocs par jour sur un mois (`YYYY-MM`) — les jours vides sont absents. */
  countByMonth: (month: string) =>
    invoke<JournalDayCount[]>("count_journal_entries_by_month", { month }),
  create: (payload: CreateJournalEntryInput) =>
    invoke<JournalEntry>("create_journal_entry", { payload }),
  /**
   * Écrire dans le journal du jour : la reprise en cours, ou une nouvelle.
   *
   * C'est le seul chemin d'écriture normal. `create` reste pour les cas qui
   * imposent un bloc à part (une entrée écrite en avance, par exemple).
   * `content` vide n'ajoute rien : la page s'en sert juste pour savoir où
   * poser le curseur.
   */
  append: (targetDay: string, content: string) =>
    invoke<JournalEntry>("append_journal_entry", { targetDay, content }),
  update: (id: string, payload: UpdateJournalEntryInput) =>
    invoke<JournalEntry>("update_journal_entry", { id, payload }),
  remove: (id: string) => invoke<void>("delete_journal_entry", { id }),
  /**
   * Cherche un passage dans tout le journal. `limit` vient de l'appelant :
   * une palette en montre quelques-uns, une page de recherche beaucoup plus.
   */
  search: (query: string, limit: number) =>
    invoke<JournalHit[]>("search_journal", { query, limit }),

  /**
   * Attacher une image, depuis un fichier choisi sur le disque. On COPIE :
   * l'original peut être déplacé ou effacé sans que la journée y perde son
   * image.
   */
  attacher: (source: string) =>
    invoke<JournalPiece>("attach_journal_piece", { source }),
  /**
   * La même chose depuis des octets — le chemin de COLLAGE. Une capture
   * d'écran n'a pas de fichier : le presse-papiers n'a que des octets.
   */
  attacherOctets: (nom: string, octets: number[]) =>
    invoke<JournalPiece>("attach_journal_piece_bytes", { nom, octets }),
  /** Les fiches des pièces citées par le document. */
  pieces: (ids: string[]) =>
    invoke<JournalPiece[]>("list_journal_pieces", { ids }),

  /**
   * Tout le journal en Markdown, ses photos dans un dossier voisin. `path`
   * vient du dialogue natif — voir `features/journal/export.ts`.
   */
  exporter: (path: string) => invoke<JournalExport>("export_journal", { path }),
};
