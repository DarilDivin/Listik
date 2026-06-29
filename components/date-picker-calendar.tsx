"use client";

import { addDays, nextMonday, nextSaturday } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";

interface DatePickerCalendarProps {
  date?: Date | null;
  /** Sélection d'une date, d'un raccourci, ou effacement (undefined). */
  onPick: (date: Date | undefined) => void;
}

/** Contenu réutilisable du sélecteur de date : raccourcis + calendrier + effacer. */
export function DatePickerCalendar({ date, onPick }: DatePickerCalendarProps) {
  const presets: { label: string; date: Date }[] = [
    { label: "Aujourd'hui", date: new Date() },
    { label: "Demain", date: addDays(new Date(), 1) },
    { label: "Ce week-end", date: nextSaturday(new Date()) },
    { label: "Semaine prochaine", date: nextMonday(new Date()) },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onPick(preset.date)}
            className="rounded-md bg-muted px-2.5 py-1 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="border-t border-border">
        <Calendar
          mode="single"
          locale={fr}
          className="w-full"
          selected={date || undefined}
          onSelect={onPick}
        />
      </div>

      {date && (
        <div className="border-t border-border p-1.5">
          <button
            type="button"
            onClick={() => onPick(undefined)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
            Effacer la date
          </button>
        </div>
      )}
    </>
  );
}
