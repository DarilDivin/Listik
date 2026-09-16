"use client";

import { Bot, PenSquare, TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";

const PROVIDERS = [
  { value: "claude", label: "Claude Code", Icon: Bot },
  { value: "opencode", label: "OpenCode", Icon: TerminalSquare },
];

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
}: {
  onNewConversation: () => void;
  canReset: boolean;
}) {
  const { settings, update } = useSettings();
  const provider = settings.ai_provider || "claude";

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 px-8 py-3">
      <span className="text-headline text-foreground">Assistant</span>

      <div className="flex items-center gap-1">
        <Select value={provider} onValueChange={(value) => update({ ai_provider: value })}>
          <SelectTrigger
            size="sm"
            aria-label="CLI d'agent"
            className="gap-1.5 border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-foreground dark:bg-transparent dark:hover:bg-accent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PROVIDERS.map(({ value, label, Icon }) => (
              <SelectItem key={value} value={value}>
                <Icon size={15} className="text-muted-foreground" />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNewConversation}
          disabled={!canReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <PenSquare />
          Nouvelle conversation
        </Button>
      </div>
    </header>
  );
}
