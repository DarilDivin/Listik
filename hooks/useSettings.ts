import useSWR from "swr";
import { toast } from "sonner";
import {
  settingsApi,
  type Settings,
  type SettingsInput,
} from "@/features/todos/settings";
import { SWR_KEYS } from "@/lib/swr-config";

/** Réglages par défaut affichés tant que le backend n'a pas répondu. */
const FALLBACK: Settings = {
  daily_digest_enabled: false,
  daily_digest_time: "08:00",
};

/**
 * Réglages applicatifs (résumé quotidien…) avec mise à jour optimiste.
 */
export function useSettings() {
  const { data, mutate, isLoading } = useSWR<Settings>(
    SWR_KEYS.SETTINGS,
    () => settingsApi.get(),
    { revalidateOnFocus: false },
  );

  const settings = data ?? FALLBACK;

  const update = async (payload: SettingsInput) => {
    try {
      await mutate(() => settingsApi.update(payload), {
        optimisticData: { ...settings, ...payload },
        rollbackOnError: true,
        revalidate: false,
      });
    } catch {
      toast.error("Réglage non enregistré");
    }
  };

  return { settings, update, loading: isLoading };
}
