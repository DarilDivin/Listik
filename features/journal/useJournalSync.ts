import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSWRConfig } from "swr";
import { JOURNAL_CHANGED } from "./api";

/**
 * Écoute l'événement `journal:changed` émis par le backend et revalide les
 * clés SWR liées au Journal (synchro entre la page-jour et la capture rapide).
 */
export function useJournalSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const unlisten = listen(JOURNAL_CHANGED, () => {
      mutate((key) => typeof key === "string" && key.startsWith("journal"));
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [mutate]);
}
