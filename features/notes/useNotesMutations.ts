import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { notesApi } from "./api";
import type { CreateNoteInput, Note, UpdateNoteInput } from "./types";
import { SWR_KEYS } from "@/lib/swr-config";

type NoteUpdater = (notes: Note[]) => Note[];

/**
 * Mutations notes (create / update / delete) avec mise à jour optimiste.
 * Le backend émet `notes:changed` après écriture → `useNotesSync` revalide.
 * On ne revalide ici qu'en cas d'erreur (rollback).
 */
export function useNotesMutations() {
  const { mutate } = useSWRConfig();

  const patch = (updater: NoteUpdater) =>
    mutate<Note[]>(SWR_KEYS.ALL_NOTES, (current = []) => updater(current), false);

  const revalidate = () =>
    mutate((key) => typeof key === "string" && key.startsWith("notes"));

  const createNote = async (payload: CreateNoteInput = {}): Promise<Note> => {
    const now = new Date().toISOString();
    const optimistic: Note = {
      id: `temp-${Date.now()}`,
      title: payload.title ?? "",
      content: payload.content ?? "",
      pinned: false,
      created_at: now,
      updated_at: now,
    };
    patch((notes) => [optimistic, ...notes]);

    try {
      return await notesApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création de la note");
      await revalidate();
      throw error;
    }
  };

  // Mise à jour en place (sans réordonner : éviter que la note saute en tête
  // à chaque frappe pendant l'autosave ; le tri définitif vient de la revalidation).
  const updateNote = async (id: string, payload: UpdateNoteInput): Promise<void> => {
    patch((notes) =>
      notes.map((note) =>
        note.id === id
          ? { ...note, ...payload, updated_at: new Date().toISOString() }
          : note,
      ),
    );

    try {
      await notesApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors de la modification de la note");
      await revalidate();
      throw error;
    }
  };

  const deleteNote = async (id: string): Promise<void> => {
    patch((notes) => notes.filter((note) => note.id !== id));

    try {
      await notesApi.remove(id);
      toast.success("Note supprimée");
    } catch (error) {
      toast.error("Erreur lors de la suppression de la note");
      await revalidate();
      throw error;
    }
  };

  return { createNote, updateNote, deleteNote };
}
