"use client";

import * as React from "react";
import { Bell, BellRing } from "lucide-react";

import { cn } from "@/lib/utils";
import { toLocalISODate, todayLocalISODate } from "@/lib/date";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ReminderControlProps {
  /** Rappel « YYYY-MM-DDTHH:MM » ou null. */
  remindAt: string | null;
  /** Date planifiée de la tâche (« YYYY-MM-DD »), utilisée comme date par défaut. */
  scheduledFor?: string | null;
  dimmed?: boolean;
  onChange: (remindAt: string | null) => void;
}

/** Heure par défaut d'un nouveau rappel. */
const DEFAULT_TIME = "09:00";

function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Rappel ponctuel d'une tâche, cliquable. Avec rappel : étiquette (heure, +
 * date si différente du jour planifié). Sans : « Rappel » discret au survol.
 */
export function ReminderControl({
  remindAt,
  scheduledFor,
  dimmed = false,
  onChange,
}: ReminderControlProps) {
  const [open, setOpen] = React.useState(false);
  const active = Boolean(remindAt);

  const datePart = remindAt
    ? remindAt.slice(0, 10)
    : scheduledFor ?? todayLocalISODate();
  const timePart = remindAt ? remindAt.slice(11, 16) : DEFAULT_TIME;

  const compose = (date: string, time: string) => `${date}T${time}`;

  const pickDate = (next: Date | undefined) => {
    if (!next) {
      // Bouton « Effacer » du calendrier → on retire le rappel.
      onChange(null);
      setOpen(false);
      return;
    }
    onChange(compose(toLocalISODate(next), timePart));
  };

  const pickTime = (time: string) => {
    onChange(compose(datePart, time || DEFAULT_TIME));
  };

  // Étiquette compacte : heure seule si même jour que la tâche, sinon date + heure.
  let label = "Rappel";
  if (active) {
    if (scheduledFor && datePart === scheduledFor) {
      label = timePart;
    } else {
      const short = parseLocalISODate(datePart).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      });
      label = `${short} ${timePart}`;
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? "Modifier le rappel" : "Ajouter un rappel"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-foreground/[0.06]",
            active
              ? "text-muted-foreground"
              : "text-muted-foreground/0 group-hover:text-muted-foreground/70",
            dimmed && "opacity-60",
          )}
        >
          {active ? (
            <BellRing size={12} className="opacity-70" />
          ) : (
            <Bell size={12} />
          )}
          {label}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-72 p-0"
      >
        <div className="border-b border-border p-2.5">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Heure du rappel
          </span>
          <TimePicker value={timePart} onChange={pickTime} />
        </div>
        <DatePickerCalendar
          date={active ? parseLocalISODate(datePart) : null}
          onPick={pickDate}
        />
      </PopoverContent>
    </Popover>
  );
}
