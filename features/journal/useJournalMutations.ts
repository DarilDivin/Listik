import { toast } from "sonner";
import { journalApi } from "./api";
import type {
  CreateJournalEntryInput,
  JournalEntry,
  UpdateJournalEntryInput,
} from "./types";

/**
 * Mutations Journal (create/update/delete). Pas de mise à jour optimiste
 * (contrairement à `useTodoMutations`) : un bloc peut apparaître dans deux
 * caches SWR différents selon `target_day` (la page-jour visée, et « À venir »
 * s'il est écrit en avance) — ambigu à patcher localement pour ce volume. Le
 * backend émet `journal:changed` juste après l'écriture ; `useJournalSync`
 * revalide alors toutes les clés `journal/*` (même approche que `useTags`).
 *
 * Pas d'undo par toast non plus (contrairement aux notes) : ce pattern venait
 * avec sa propre Map de minuteurs indépendante du slot unifié des todos
 * (Phase O) — le copier ici aurait réintroduit exactement la dette qui vient
 * d'être retirée. La suppression est protégée par une confirmation dans l'UI
 * à la place.
 */
export function useJournalMutations() {
  const createEntry = async (
    payload: CreateJournalEntryInput,
  ): Promise<JournalEntry> => {
    try {
      return await journalApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création du bloc");
      throw error;
    }
  };

  const updateEntry = async (
    id: string,
    payload: UpdateJournalEntryInput,
  ): Promise<JournalEntry> => {
    try {
      return await journalApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors de la modification du bloc");
      throw error;
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    try {
      await journalApi.remove(id);
    } catch (error) {
      toast.error("Erreur lors de la suppression du bloc");
      throw error;
    }
  };

  return { createEntry, updateEntry, deleteEntry };
}
