"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const activeMeta = PROVIDER_META[active] ?? PROVIDER_META.claude;
  const activeItem = providers?.find((provider) => provider.id === active);
  const activeState = providerStatus(activeItem, results[active]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/75 text-brand shadow-sm"><AppIcon icon={activeMeta.icon} size={20} /></span>
          <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Assistant utilisé</p><p className="truncate text-sm font-semibold text-foreground">{activeMeta.label}</p></div>
        </div>
        <StatusBadge state={activeState.tone} label={activeState.label} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Détection locale : aucun compte ni jeton n’est lu par Listik.</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void mutate()} disabled={isLoading} className="text-muted-foreground"><RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />Actualiser</Button>
      </div>

      <div className="space-y-2" aria-live="polite">
        {PROVIDER_IDS.map((id) => {
          const item = providers?.find((provider) => provider.id === id);
          const meta = PROVIDER_META[id];
          const isActive = active === id;
          const result = results[id];
          const state = providerStatus(item, result);
          const usable = item?.connection === "ready" || result?.state === "success";
          return (
            <article key={id} className={cn("rounded-2xl px-3.5 py-3 transition-colors", isActive ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.035]")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground shadow-sm"><AppIcon icon={meta.icon} size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{meta.label}</p>{isActive && <span className="text-xs text-brand">Utilisé</span>}<StatusBadge state={state.tone} label={state.label} /></div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{result?.state === "error" ? result.message : item?.detail ?? "Recherche du CLI…"}{item?.version ? ` · ${item.version}` : ""}</p>
                </div>
                {!item || !item.installed ? <span className="text-xs text-muted-foreground">À installer</span> : usable ? (isActive ? <span className="inline-flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-brand"><Check className="size-3.5" />Actif</span> : <Button type="button" size="sm" variant="outline" onClick={() => void update({ ai_provider: id })}>Utiliser</Button>) : <div className="flex flex-wrap gap-1.5"><Button type="button" variant="ghost" size="sm" onClick={() => void connect(id)}>Se connecter</Button><Button type="button" variant="outline" size="sm" disabled={testing === id} onClick={() => void test(id)}>{testing === id ? "Test…" : "Tester"}</Button></div>}
              </div>
              {result?.state === "success" && <p className="ml-12 mt-2 text-xs text-brand">{result.message}</p>}
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">« Tester la connexion » envoie une réponse minimale et peut consommer un crédit. Les CLI restent responsables de leur authentification.</p>
    </div>
  );
}

function StatusBadge({ state, label }: { state: ProviderConnection | "error"; label: string }) {
  const tone = state === "ready" ? "bg-brand/10 text-brand" : state === "auth_required" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : state === "error" ? "bg-destructive/10 text-destructive" : "bg-foreground/[0.06] text-muted-foreground";
  return <Badge variant="ghost" className={cn("h-5 border-0 px-1.5 text-[10px] font-medium", tone)}>{label}</Badge>;
}
