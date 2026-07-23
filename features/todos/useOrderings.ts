import useSWR, { useSWRConfig } from "swr";
import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Ordering } from "./generated/Ordering";
import { SWR_KEYS } from "@/lib/swr-config";

/**
 * Positions d'ordre manuel, par contexte (« today », « project:<id> »…).
 * La clé vit sous le préfixe `todos/` : `set_ordering` émet `todos:changed`,
 * la revalidation multi-fenêtres est donc déjà couverte par `useTodosSync`.
 */
export function useOrderings() {
  const { mutate } = useSWRConfig();
  const { data = [] } = useSWR(
    SWR_KEYS.ORDERINGS,
    () => invoke<Ordering[]>("get_orderings"),
    { revalidateOnFocus: false, dedupingInterval: 2000 },
  );

  const positionsByContext = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const o of data) {
      let ctx = map.get(o.context);
      if (!ctx) {
        ctx = new Map();
        map.set(o.context, ctx);
      }
      ctx.set(o.todo_id, o.position);
    }
    return map;
  }, [data]);

  /** Remplace l'ordre d'un contexte (optimiste : le drop se pose sans attendre l'IPC). */
  const setOrdering = useCallback(
    async (context: string, orderedIds: string[]) => {
      mutate<Ordering[]>(
        SWR_KEYS.ORDERINGS,
        (current = []) => [
          ...current.filter((o) => o.context !== context),
          ...orderedIds.map((todo_id, position) => ({ context, todo_id, position })),
        ],
        false,
      );
      try {
        await invoke("set_ordering", { context, orderedIds });
      } catch (error) {
        toast.error("Erreur lors du réordonnancement");
        await mutate(SWR_KEYS.ORDERINGS);
        throw error;
      }
    },
    [mutate],
  );

  return { positionsByContext, setOrdering };
}
