import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { tagsApi } from "@/features/tags/api";
import { useTagsSync } from "@/features/tags/useTagsSync";
import type { CreateTagInput, Tag, UpdateTagInput } from "@/features/tags/types";
import { SWR_KEYS } from "@/lib/swr-config";

/**
 * Tags (contexte transverse). Même pattern que `useProjects` : SWR +
 * revalidation par événement backend (`tags:changed`).
 *
 * Pas de mise à jour optimiste sur les mutations de tag : un renommage change
 * les pastilles de toutes les tâches porteuses, ce que seul le backend sait
 * recalculer (il émet `todos:changed` pour ça). Attendre la réponse évite un
 * état intermédiaire faux.
 */
export const useTags = () => {
  useTagsSync();
  const { mutate } = useSWRConfig();

  const { data: tags = [], isLoading: loading } = useSWR(
    SWR_KEYS.ALL_TAGS,
    () => tagsApi.list(),
    { revalidateOnFocus: true, dedupingInterval: 2000 },
  );

  const revalidate = () =>
    mutate((key) => typeof key === "string" && key.startsWith("tags"));

  const createTag = async (payload: CreateTagInput): Promise<Tag> => {
    try {
      return await tagsApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création du tag");
      await revalidate();
      throw error;
    }
  };

  const updateTag = async (id: string, payload: UpdateTagInput) => {
    try {
      await tagsApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors du renommage du tag");
      await revalidate();
      throw error;
    }
  };

  const deleteTag = async (id: string) => {
    try {
      await tagsApi.remove(id);
      toast.success("Tag supprimé");
    } catch (error) {
      toast.error("Erreur lors de la suppression du tag");
      await revalidate();
      throw error;
    }
  };

  /**
   * Résout des noms (`@urgent` de la capture) en ids : réutilise un tag
   * existant à la casse près, sinon le crée. `create_tag` étant lui-même un
   * get-or-create côté Rust, un cache un peu en retard ne crée pas de doublon.
   */
  const resolveTagNames = async (names: string[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const existing = tags.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      ids.push(existing ? existing.id : (await createTag({ name })).id);
    }
    return ids;
  };

  /** Remplace l'intégralité des tags d'une tâche. */
  const setTodoTags = async (todoId: string, tagIds: string[]) => {
    try {
      await tagsApi.setForTodo(todoId, tagIds);
    } catch (error) {
      toast.error("Erreur lors de la modification des tags");
      await mutate((key) => typeof key === "string" && key.startsWith("todos"));
      throw error;
    }
  };

  return {
    tags,
    loading,
    createTag,
    updateTag,
    deleteTag,
    setTodoTags,
    resolveTagNames,
  };
};
