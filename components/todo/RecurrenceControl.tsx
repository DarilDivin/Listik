"use client";

import * as React from "react";
import { Check, Repeat } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RECURRENCE_OPTIONS, recurrenceLabel } from "@/features/todos/recurrence";
import type { Recurrence } from "@/features/todos/types";

interface RecurrenceControlProps {
  recurrence: Recurrence;
  dimmed?: boolean;
  onChange: (recurrence: Recurrence) => void;
}

/**
 * Récurrence d'une tâche, cliquable. Avec récurrence : étiquette (icône boucle).
 * Sans (none) : « Répéter » discret révélé au survol de la ligne.
 */
export function RecurrenceControl({
  recurrence,
  dimmed = false,
  onChange,
}: RecurrenceControlProps) {
  const [open, setOpen] = React.useState(false);
  const active = recurrence !== "none";

  const pick = (next: Recurrence) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Récurrence"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-foreground/[0.06]",
            active
              ? "text-muted-foreground"
              : "text-muted-foreground/0 group-hover:text-muted-foreground/70",
            dimmed && "opacity-60",
          )}
        >
          <Repeat size={12} className="opacity-70" />
          {active ? recurrenceLabel(recurrence) : "Répéter"}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-48 p-1"
      >
        {RECURRENCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => pick(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
              option.value === recurrence ? "bg-accent/60 text-foreground" : "text-foreground",
            )}
          >
            <span className="flex-1 text-left">{option.label}</span>
            {option.value === recurrence && (
              <Check className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
