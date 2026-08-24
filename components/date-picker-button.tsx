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
}

/** Libellé court pour le chip : « Auj. » / « Demain » / « 7 juin ». */
function shortLabel(date: Date): string {
  if (isToday(date)) return "Auj.";
  if (isTomorrow(date)) return "Demain";
  return format(date, "d MMM", { locale: fr });
}

export function DatePickerButton({ date, onDateChange }: DatePickerButtonProps) {
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
            "flex h-9 items-center rounded-lg bg-muted text-sm font-medium text-foreground transition-colors hover:bg-muted/80 outline-none",
            date ? "gap-1.5 pl-2.5 pr-2.5" : "w-9 justify-center text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
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
