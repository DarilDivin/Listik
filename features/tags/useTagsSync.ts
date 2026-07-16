import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSWRConfig } from "swr";
import { TAGS_CHANGED } from "./api";

/**
 * Écoute `tags:changed` et revalide les clés SWR des tags — même rôle que
 * `useTodosSync` pour les tâches (synchro multi-fenêtres).
 *
 * Les tâches, elles, sont revalidées par `todos:changed` : le backend l'émet
 * AUSSI sur un renommage/suppression de tag, car les tags sont dénormalisés
 * dans chaque `Todo`.
 */
export function useTagsSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const unlisten = listen(TAGS_CHANGED, () => {
      mutate((key) => typeof key === "string" && key.startsWith("tags"));
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [mutate]);
}
