import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSWRConfig } from "swr";
import { NOTES_CHANGED } from "./api";

/**
 * Écoute l'événement `notes:changed` émis par le backend et revalide les clés
 * SWR liées aux notes (synchro entre la section Notes et la capture rapide).
 */
export function useNotesSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const unlisten = listen(NOTES_CHANGED, () => {
      mutate((key) => typeof key === "string" && key.startsWith("notes"));
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [mutate]);
}
