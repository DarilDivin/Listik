"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { parseTime } from "@/lib/time";

/** Heures suggérées par défaut (champ vide ou saisie complète). */
const PRESETS = ["09:00", "12:00", "18:00", "21:00"];

interface TimePickerProps {
  /** Heure au format « HH:MM ». */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Saisie d'heure « intelligente » : on tape librement (« 930 », « 9:30 »,
 * « 9h », « 9pm »…) et c'est reformaté en HH:MM à la validation. Des suggestions
 * cliquables s'adaptent à la frappe (quarts d'heure si on a tapé une heure).
 */
export function TimePicker({
  value,
  onChange,
  className,
  autoFocus,
}: TimePickerProps) {
  const [draft, setDraft] = React.useState(value);

  // Resynchronise quand la valeur change à l'extérieur (sauf pendant la frappe).
  React.useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const parsed = parseTime(draft);
    if (parsed) {
      setDraft(parsed);
      if (parsed !== value) onChange(parsed);
    } else {
      setDraft(value); // saisie invalide → on revient à la valeur courante
    }
  };

  const choose = (time: string) => {
    setDraft(time);
    if (time !== value) onChange(time);
  };

  // Si on a tapé juste une heure (« 9 »), proposer ses quarts d'heure.
  const hourOnly = draft.trim().match(/^(\d{1,2})$/);
  const suggestions =
    hourOnly && Number(hourOnly[1]) <= 23
      ? ["00", "15", "30", "45"].map(
          (m) => `${hourOnly[1].padStart(2, "0")}:${m}`,
        )
      : PRESETS;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
          }
        }}
        placeholder="9:30"
        className="w-16 shrink-0 rounded-md border border-input bg-transparent px-2 py-1.5 text-center text-sm font-medium tabular-nums text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/50 focus:border-ring"
      />

      <div className="flex flex-1 flex-wrap gap-1">
        {suggestions.map((time) => (
          <button
            key={time}
            type="button"
            // Évite que l'input perde le focus (et déclenche commit) avant le clic.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(time)}
            className={cn(
              "rounded-md px-2 py-1 text-xs tabular-nums leading-none transition-colors",
              time === value
                ? "bg-brand text-brand-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {time}
          </button>
        ))}
      </div>
    </div>
  );
}
