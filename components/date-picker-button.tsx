"use client";

import * as React from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerButtonProps {
  date?: Date | null;
  onDateChange?: (date: Date | undefined) => void;
  /** Gabarit resserré : le contrôle vit sur la ligne de texte d'une rangée de
   *  capture, il doit en faire exactement la hauteur (sinon la rangée grandit
   *  au focus et le texte se décale). */
  compact?: boolean;
}

/** Libellé court pour le chip : « Auj. » / « Demain » / « 7 juin ». */
function shortLabel(date: Date): string {
  if (isToday(date)) return "Auj.";
  if (isTomorrow(date)) return "Demain";
  return format(date, "d MMM", { locale: fr });
}

export function DatePickerButton({
  date,
  onDateChange,
  compact,
}: DatePickerButtonProps) {
  const [open, setOpen] = React.useState(false);

  const pick = (next: Date | undefined) => {
    onDateChange?.(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-empty={!date}
          className={cn(
            "flex items-center rounded-lg bg-muted font-medium text-foreground transition-colors hover:bg-muted/80 outline-none",
            compact ? "h-6 text-xs" : "h-9 text-sm",
            date
              ? compact
                ? "gap-1 px-2"
                : "gap-1.5 pl-2.5 pr-2.5"
              : cn("justify-center text-muted-foreground", compact ? "w-6" : "w-9"),
          )}
        >
          <CalendarIcon className={cn("shrink-0 text-muted-foreground", compact ? "size-3.5" : "size-4")} />
          {date && <span>{shortLabel(date)}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-auto p-0"
      >
        <DatePickerCalendar date={date} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
