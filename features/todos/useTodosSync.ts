import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSWRConfig } from "swr";
import { TODOS_CHANGED } from "./api";

/**
 * Écoute l'événement `todos:changed` émis par le backend et revalide
 * toutes les clés SWR liées aux todos. C'est ce qui synchronise les
 * fenêtres entre elles (créer une tâche via la capture rapide rafraîchit « planner »).
 */
export function useTodosSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const unlisten = listen(TODOS_CHANGED, () => {
      mutate((key) => typeof key === "string" && key.startsWith("todos"));
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, [mutate]);
}
