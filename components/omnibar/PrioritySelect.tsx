"use client";

import * as React from "react";
import { Check, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Priority } from "@/features/todos/types";

interface PrioritySelectProps {
  /** Gabarit resserré : hauteur d'une ligne de texte (rangée de capture). */
  compact?: boolean;
  value: Priority;
  onChange: (priority: Priority) => void;
}

const OPTIONS: { value: Priority; label: string; color: string | null }[] = [
  { value: "normal", label: "Aucune", color: null },
  { value: "high", label: "Haute", color: "#ef4444" },
  { value: "low", label: "Basse", color: "#10b981" },
];

/** Pastille de priorité (pleine pour haute/basse, anneau creux pour « aucune »). */
function Dot({ color }: { color: string | null }) {
  return color ? (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  ) : (
    <span className="size-2.5 shrink-0 rounded-full border border-muted-foreground/50" />
  );
}

/**
 * Sélecteur de priorité : discret quand « Aucune », coloré sinon.
 * Construit sur Popover (et non Radix Select) car ce dernier remanie le focus de
 * façon trop agressive pour la fenêtre flottante de capture rapide.
 */
export function PrioritySelect({ value, onChange, compact }: PrioritySelectProps) {
  const [open, setOpen] = React.useState(false);
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  const pick = (next: Priority) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Priorité"
          className={cn(
            "flex items-center rounded-lg bg-muted font-medium text-foreground outline-none transition-colors hover:bg-muted/80",
            compact ? "h-6 gap-1 px-2 text-xs" : "h-9 gap-1.5 px-2.5 text-sm",
          )}
        >
          {value === "normal" ? (
            <Flag className={cn("text-muted-foreground", compact ? "size-3.5" : "size-4")} />
          ) : (
            <>
              <Dot color={current.color} />
              <span>{current.label}</span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-40 p-1"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => pick(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
              option.value === value && "bg-accent/60",
            )}
          >
            <Dot color={option.color} />
            <span className="flex-1 text-left">{option.label}</span>
            {option.value === value && (
              <Check className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
