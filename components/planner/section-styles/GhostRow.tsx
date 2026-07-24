"use client";

import { Repeat } from "lucide-react";

interface GhostRowProps {
  text: string;
  recurrenceLabel: string;
}

/**
 * Occurrence future PROJETÉE d'une tâche récurrente — jamais une ligne
 * réelle : pas d'id, pas de coche, pas de survol, pas de menu. L'ABSENCE
 * d'affordance interactive est le signal (plus fiable qu'une simple
 * opacité, ambiguë avec un état désactivé/en chargement).
 */
export function GhostRow({ text, recurrenceLabel }: GhostRowProps) {
  return (
    <div className="flex cursor-default items-start gap-2.5 px-3 py-1.5">
      <Repeat size={13} className="mt-[3px] shrink-0 text-muted-foreground/45" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-snug tracking-[-0.01em] text-muted-foreground/80">
          {text}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">{recurrenceLabel}</p>
      </div>
    </div>
  );
}
