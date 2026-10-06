"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { PROVIDER_IDS, PROVIDER_META } from "@/features/assistant/provider-meta";
import { aiProvidersApi, type CliProviderStatus, type ProviderConnection, type ProviderId } from "@/features/assistant/providers";

type TestResult = { state: "success" | "error"; message: string };
type TestResults = Partial<Record<ProviderId, TestResult>>;
const TEST_RESULTS_KEY = "listik.ai-provider-tests";

const STATUS_LABEL: Record<ProviderConnection, string> = {
  missing: "Non installé", auth_required: "Connexion requise", verify: "À vérifier", ready: "Prêt",
};

function loadTestResults(): TestResults {
  try {
    const saved = sessionStorage.getItem(TEST_RESULTS_KEY);
    return saved ? (JSON.parse(saved) as TestResults) : {};
  } catch { return {}; }
}

function providerStatus(item: CliProviderStatus | undefined, result: TestResult | undefined) {
  if (result?.state === "success") return { label: "Connexion confirmée", tone: "ready" as const };
  if (result?.state === "error") return { label: "Échec du test", tone: "error" as const };
  if (!item) return { label: "Recherche…", tone: "verify" as const };
  return { label: STATUS_LABEL[item.connection], tone: item.connection };
}

/** Parcours local : détecter, se connecter dans le CLI, vérifier, puis choisir. */
export function AiProviderSetting() {
  const { settings, update } = useSettings();
  const active = (settings.ai_provider as ProviderId) || "claude";
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<TestResults>({});
  const { data: providers, mutate, isLoading } = useSWR("ai-providers", aiProvidersApi.inspect, { revalidateOnFocus: false });

  useEffect(() => setResults(loadTestResults()), []);

  const saveResult = (provider: ProviderId, result: TestResult) => setResults((current) => {
    const next = { ...current, [provider]: result };
    try { sessionStorage.setItem(TEST_RESULTS_KEY, JSON.stringify(next)); } catch { /* résultat de confort */ }
    return next;
  });

  const connect = async (provider: ProviderId) => {
    try {
      await aiProvidersApi.connect(provider);
      toast.message("Terminal ouvert — terminez la connexion, puis actualisez l’état.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’ouvrir le terminal");
    }
  };

  const test = async (provider: ProviderId) => {
    setTesting(provider);
    try {
      await aiProvidersApi.test(provider);
      saveResult(provider, { state: "success", message: "Connexion Listik confirmée." });
      toast.success("Connexion Listik confirmée");
      void mutate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test de connexion échoué";
      saveResult(provider, { state: "error", message });
      toast.error(message);
    } finally { setTesting(null); }
  };

  return (
    <div aria-live="polite">
      <SettingsGroup
        title="Sur cet ordinateur"
        action={<Button type="button" variant="ghost" size="xs" onClick={() => void mutate()} disabled={isLoading} className="text-muted-foreground"><RefreshCw className={cn("size-3", isLoading && "animate-spin")} />Actualiser</Button>}
      >
          {PROVIDER_IDS.map((id) => {
            const item = providers?.find((provider) => provider.id === id);
            const meta = PROVIDER_META[id];
            const isActive = active === id;
            const result = results[id];
            const state = providerStatus(item, result);
            const usable = item?.connection === "ready" || result?.state === "success";
            return (
              <div key={id} className="py-3.5">
                <div className="flex items-center gap-3">
                  <AppIcon icon={meta.icon} size={18} className={isActive ? "text-brand" : "text-muted-foreground"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-foreground">{meta.label}</p>{isActive && <span className="text-xs text-brand">Utilisé</span>}<StatusBadge state={state.tone} label={state.label} /></div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{result?.state === "error" ? result.message : item?.detail ?? "Recherche du CLI…"}{item?.version ? ` · ${item.version}` : ""}</p>
                  </div>
                  <div className="shrink-0">
                    {!item || !item.installed ? <span className="text-xs text-muted-foreground">À installer</span> : usable ? (isActive ? <span className="inline-flex h-7 items-center gap-1.5 px-1 text-xs font-medium text-brand"><Check className="size-3.5" />Actif</span> : <Button type="button" size="sm" variant="outline" onClick={() => void update({ ai_provider: id })}>Utiliser</Button>) : <div className="flex gap-1.5"><Button type="button" variant="ghost" size="sm" onClick={() => void connect(id)}>Se connecter</Button><Button type="button" variant="outline" size="sm" disabled={testing === id} onClick={() => void test(id)}>{testing === id ? "Test…" : "Tester"}</Button></div>}
                  </div>
                </div>
                {result?.state === "success" && <p className="mt-1.5 pl-[30px] text-xs text-brand">{result.message}</p>}
              </div>
            );
          })}
      </SettingsGroup>
      <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">Détection locale : aucun compte ni jeton n’est lu par Listik. « Tester » envoie une réponse minimale et peut consommer un crédit ; chaque CLI reste responsable de sa connexion.</p>
    </div>
  );
}

function StatusBadge({ state, label }: { state: ProviderConnection | "error"; label: string }) {
  const tone = state === "ready" ? "bg-brand/10 text-brand" : state === "auth_required" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : state === "error" ? "bg-destructive/10 text-destructive" : "bg-foreground/[0.06] text-muted-foreground";
  return <Badge variant="ghost" className={cn("h-5 border-0 px-1.5 text-[10px] font-medium", tone)}>{label}</Badge>;
}
