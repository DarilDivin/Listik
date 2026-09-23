"use client";

import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import useSWR from "swr";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { PROVIDER_IDS, PROVIDER_META } from "@/features/assistant/provider-meta";
import { aiProvidersApi } from "@/features/assistant/providers";

/**
 * En-tête de la page (`site-header.tsx` du template) : le titre de la surface,
 * le CLI d'agent, et « Nouvelle conversation » — le template le place là, et
 * jusqu'ici rien ne permettait de repartir de zéro.
 *
 * Le sélecteur écrit dans le MÊME réglage que Réglages → Assistant
 * (`useSettings`), il n'y a donc qu'une source de vérité : c'est un choix
 * persistant, pas un choix par message comme le `ModelSelect` du template.
 */
export function AssistantHeader({
  onNewConversation,
  canReset,
  busy = false,
}: {
  onNewConversation: () => void;
  canReset: boolean;
  busy?: boolean;
}) {
  const { settings, update } = useSettings();
  const provider = settings.ai_provider || "claude";
  const { data: providers } = useSWR("ai-providers", aiProvidersApi.inspect, {
    revalidateOnFocus: false,
  });

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 px-8 py-3">
      <h1 className="text-headline text-foreground">Assistant</h1>

      <div className="flex items-center gap-1">
        <Select value={provider} onValueChange={(value) => update({ ai_provider: value })} disabled={busy}>
          <SelectTrigger
            size="sm"
            aria-label="Assistant utilisé"
            className="gap-1.5 border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-foreground dark:bg-transparent dark:hover:bg-accent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PROVIDER_IDS.map((value) => {
              const { label, icon } = PROVIDER_META[value];
              const status = providers?.find((item) => item.id === value);
              const unavailable = value !== provider && status?.connection !== "ready";
              return (
              <SelectItem key={value} value={value} disabled={unavailable}>
                <AppIcon icon={icon} size={15} className="text-muted-foreground" />
                {label}{unavailable ? " — à configurer" : ""}
              </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNewConversation}
          disabled={!canReset || busy}
          className="text-muted-foreground hover:text-foreground"
        >
          <AppIcon icon={PencilEdit02Icon} />
          Nouvelle conversation
        </Button>
      </div>
    </header>
  );
}
