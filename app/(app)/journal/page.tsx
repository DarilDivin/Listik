"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { useTags } from "@/hooks/useTags";
import { JournalEntryRow } from "@/components/journal/JournalEntryRow";
import { JournalComposer } from "@/components/journal/JournalComposer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { spring } from "@/lib/motion";
import { todayLocalISODate } from "@/lib/date";

/** Parse une date « jour seul » en Date locale (évite le décalage UTC). */
function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDay(day: string, delta: number): string {
  const date = parseLocalISODate(day);
  date.setDate(date.getDate() + delta);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${d}`;
}

export default function JournalPage() {
  const today = todayLocalISODate();
  const [day, setDay] = useState(today);
  const {
    entries,
    upcoming,
    loading,
    createEntry,
    updateEntry,
    deleteEntry,
  } = useJournal(day);
  const { tags, createTag, setJournalEntryTags } = useTags();

  const isToday = day === today;
  const dateLabel = format(parseLocalISODate(day), "EEEE d MMMM yyyy", {
    locale: fr,
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden px-8">
      <div className="flex items-center gap-2 border-b border-border/50 pb-4 pt-8">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Jour précédent"
          onClick={() => setDay((d) => shiftDay(d, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-2 capitalize text-foreground">
            {dateLabel}
          </h1>
        </div>
        {!isToday && (
          <Button variant="outline" size="sm" onClick={() => setDay(today)}>
            Aujourd&apos;hui
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Jour suivant"
          onClick={() => setDay((d) => shiftDay(d, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex flex-col gap-3 pt-4">
            {[0.9, 0.6].map((opacity) => (
              <div key={opacity} style={{ opacity }}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center py-10">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="rounded-2xl bg-brand-soft text-brand"
                >
                  <NotebookPen />
                </EmptyMedia>
                <EmptyTitle>
                  {isToday ? "Journal vide" : "Rien écrit ce jour-là"}
                </EmptyTitle>
                <EmptyDescription>
                  Écrivez ci-dessous — un bloc par pensée, horodaté.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={spring.smooth}
              >
                <JournalEntryRow
                  entry={entry}
                  allTags={tags}
                  onChangeContent={(content) =>
                    void updateEntry(entry.id, { content })
                  }
                  onChangeTags={(tagIds) =>
                    void setJournalEntryTags(entry.id, tagIds)
                  }
                  onCreateTag={(name) => createTag({ name }).then((t) => t.id)}
                  onDelete={() => void deleteEntry(entry.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Seulement sur la page d'aujourd'hui : sur un autre jour, une
            entrée à venir peut déjà apparaître dans le fil ci-dessus
            (page-jour de cette entrée) — double affichage évité. */}
        {isToday && upcoming.length > 0 && (
          <div className="mt-6 border-t border-border/50 pt-4">
            <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              À venir
            </h2>
            <ul className="flex flex-col gap-0.5">
              {upcoming.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setDay(entry.target_day)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-foreground/[0.03]"
                  >
                    <span className="shrink-0 text-[11px] font-medium text-brand">
                      {format(parseLocalISODate(entry.target_day), "d MMM", {
                        locale: fr,
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {entry.content.split("\n")[0] || "Bloc vide"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="shrink-0 pb-6 pt-2">
        <JournalComposer
          placeholder={
            isToday ? "Écrire pour aujourd'hui…" : `Écrire pour le ${dateLabel}…`
          }
          onSubmit={async (content) => {
            await createEntry({ target_day: day, content });
          }}
        />
      </div>
    </div>
  );
}
