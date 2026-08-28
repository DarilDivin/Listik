// Couche d'accès aux commandes Tauri du Journal (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type {
  CreateJournalEntryInput,
  JournalDayCount,
  JournalEntry,
  UpdateJournalEntryInput,
} from "./types";

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
  update: (id: string, payload: UpdateJournalEntryInput) =>
    invoke<JournalEntry>("update_journal_entry", { id, payload }),
  remove: (id: string) => invoke<void>("delete_journal_entry", { id }),
};
