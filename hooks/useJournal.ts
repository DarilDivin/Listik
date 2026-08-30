import useSWR from "swr";
import { journalApi } from "@/features/journal/api";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useJournalSync } from "@/features/journal/useJournalSync";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate } from "@/lib/date";

/**
 * Données et mutations du Journal pour une page-jour donnée, plus (en option)
 * les blocs écrits en avance (« À venir »). Un seul point d'entrée par vue,
 * même pattern que `usePlannerTodos`/`useNotes`.
 *
 * `withUpcoming` (défaut `true`) : le widget Journal de l'accueil (Phase Q)
 * n'affiche que le jour courant et n'a pas besoin de « À venir » — le mettre
 * à `false` y évite un appel IPC `list_upcoming_journal_entries` inutile à
 * chaque montage/focus.
 */
export const useJournal = (day: string, withUpcoming = true) => {
  useJournalSync();

  const {
    data: entries = [],
    isLoading: loading,
    mutate: refetchDay,
  } = useSWR(SWR_KEYS.JOURNAL_DAY(day), () => journalApi.listForDay(day), {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  const today = todayLocalISODate();
  const {
    data: upcoming = [],
    isLoading: upcomingLoading,
    mutate: refetchUpcoming,
  } = useSWR(
    withUpcoming ? SWR_KEYS.JOURNAL_UPCOMING : null,
    () => journalApi.listUpcoming(today),
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    },
  );

  const { createEntry, appendEntry, updateEntry, deleteEntry } =
    useJournalMutations();

  return {
    entries,
    upcoming,
    loading,
    upcomingLoading,
    createEntry,
    appendEntry,
    updateEntry,
    deleteEntry,
    refetchDay,
    refetchUpcoming,
  };
};
