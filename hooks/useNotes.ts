import useSWR from "swr";
import { notesApi } from "@/features/notes/api";
import { useNotesMutations } from "@/features/notes/useNotesMutations";
import { useNotesSync } from "@/features/notes/useNotesSync";
import { SWR_KEYS } from "@/lib/swr-config";

/**
 * Données et mutations des notes. Le backend trie déjà (épinglées d'abord,
 * puis les plus récemment modifiées) ; la recherche se fait côté client
 * (instantanée) sur la liste déjà chargée.
 */
export const useNotes = () => {
  useNotesSync();

  const {
    data: notes = [],
    error,
    isLoading: loading,
    mutate: refetch,
  } = useSWR(SWR_KEYS.ALL_NOTES, () => notesApi.list(), {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const { createNote, updateNote, deleteNote } = useNotesMutations();

  return {
    notes,
    loading,
    error: error?.message ?? null,
    createNote,
    updateNote,
    deleteNote,
    refetch,
  };
};
