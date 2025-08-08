"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerButtonProps {
  date?: Date | null;
  onDateChange?: (date: Date | undefined) => void;
}

export function DatePickerButton({ date, onDateChange }: DatePickerButtonProps) {

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
          className="relative data-[empty=true]:text-muted-foreground w-9 bg-gray-200/50 flex justify-center items-center font-normal border-none"
        >
          <CalendarIcon className="size-icon" />
          {/* Badge bleu quand une date est définie */}
          {date && (
            <div className="absolute -top-[2px] -right-[2px] w-2 h-2 bg-blue-500 rounded-full border-[1px] border-gray-200/50" />
          )}
          {/* {date ? format(date, "PPP") : <span>Pick a date</span>} */}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date || undefined} onSelect={onDateChange} />
      </PopoverContent>
    </Popover>
  )
}