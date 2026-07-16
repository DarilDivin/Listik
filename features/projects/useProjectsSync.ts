import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSWRConfig } from "swr";
import { PROJECTS_CHANGED } from "./api";

/**
 * Écoute `projects:changed` et revalide les clés SWR des domaines/projets —
 * même rôle que `useTodosSync` pour les tâches (synchro multi-fenêtres).
 */
export function useProjectsSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const unlisten = listen(PROJECTS_CHANGED, () => {
      mutate((key) => typeof key === "string" && key.startsWith("projects"));
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [mutate]);
}
