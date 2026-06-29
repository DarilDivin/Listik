"use client";

import * as React from "react";
import { Calendar, CalendarPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TodoDateControlProps {
  /** Date planifiée « YYYY-MM-DD » ou null. */
  date: string | null;
  overdue?: boolean;
  dimmed?: boolean;
  onChange: (date: string | null) => void;
}

/** Parse une date « jour seul » en Date locale (évite le décalage UTC). */
function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Date d'une tâche, cliquable pour (re)planifier. Avec une date : pastille
 * calendrier + libellé (rouge si en retard). Sans date : « Planifier » discret,
 * révélé au survol de la ligne.
 */
export function TodoDateControl({
  date,
  overdue = false,
  dimmed = false,
  onChange,
}: TodoDateControlProps) {
  const [open, setOpen] = React.useState(false);
  const selected = date ? parseLocalISODate(date) : null;
  const label = selected
    ? selected.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;

  const pick = (next: Date | undefined) => {
    onChange(next ? toLocalISODate(next) : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={date ? "Replanifier" : "Planifier"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-foreground/[0.06]",
            date
              ? overdue
                ? "text-destructive"
                : "text-muted-foreground"
              : "text-muted-foreground/0 group-hover:text-muted-foreground/70",
            dimmed && "opacity-60",
          )}
        >
          {date ? (
            <Calendar size={12} className="opacity-70" />
          ) : (
            <CalendarPlus size={12} />
          )}
          {label ?? "Planifier"}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-auto p-0"
      >
        <DatePickerCalendar date={selected} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
