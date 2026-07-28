// Couche d'accès aux commandes Tauri du Journal (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type {
  CreateJournalEntryInput,
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
  create: (payload: CreateJournalEntryInput) =>
    invoke<JournalEntry>("create_journal_entry", { payload }),
  update: (id: string, payload: UpdateJournalEntryInput) =>
    invoke<JournalEntry>("update_journal_entry", { id, payload }),
  remove: (id: string) => invoke<void>("delete_journal_entry", { id }),
};
