"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { NotebookPen } from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { useTags } from "@/hooks/useTags";
import { JournalEntryRow } from "@/components/journal/JournalEntryRow";
import { JournalComposer } from "@/components/journal/JournalComposer";
import { spring } from "@/lib/motion";
import { todayLocalISODate } from "@/lib/date";

/**
 * Aperçu de la page-jour du Journal directement sur l'accueil Aujourd'hui
 * (Phase Q) — réutilise les mêmes briques que la page complète
 * (`JournalEntryRow`, `JournalComposer`), pas de nouveau renderer : écrire,
 * modifier ou taguer un bloc ne demande jamais de quitter l'accueil. Le lien
 * « Ouvrir » ne sert qu'à naviguer vers un AUTRE jour (la page complète a la
 * navigation par jour, absente ici par construction).
 */
export function JournalWidget() {
  const today = todayLocalISODate();
  // Pas de « À venir » ici : le widget ne montre que le jour courant.
  const { entries, createEntry, updateEntry, deleteEntry } = useJournal(
    today,
    false,
  );
  const { tags, createTag, setJournalEntryTags } = useTags();

  return (
    <section className="border-t border-border/60 pt-6">
      <div className="flex items-center justify-between px-3 pb-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
          <NotebookPen size={13} className="text-muted-foreground/70" />
          Journal
        </h3>
        <Link
          href="/journal"
          className="text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          Ouvrir
        </Link>
      </div>

      {entries.length > 0 && (
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

      <div className="pt-2">
        <JournalComposer
          placeholder="Écrire dans le Journal…"
          onSubmit={async (content) => {
            await createEntry({ target_day: today, content });
          }}
        />
      </div>
    </section>
  );
}
