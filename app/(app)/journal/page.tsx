"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { useTags } from "@/hooks/useTags";
import { JournalBlock, type Caret } from "@/components/journal/JournalBlock";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

/**
 * Au-delà d'une heure sans écrire, on considère qu'on a REPRIS : le bloc
 * suivant garde son heure affichée. C'est ce qui rend le rythme d'une journée
 * lisible sans horodater chaque paragraphe.
 */
const REPRISE_MS = 60 * 60 * 1000;

type Saving = "idle" | "saving" | "saved";

/**
 * La page-jour : une seule surface d'écriture continue, pas une liste de
 * blocs surmontée d'un champ de saisie. On écrit, ça s'enregistre — il n'y a
 * rien à soumettre.
 *
 * La page RETIENT pourtant des moments : chaque paragraphe reste une ligne en
 * base, avec son heure et ses tags. Entrée coupe, Retour arrière recolle, les
 * flèches traversent — c'est ce clavier qui fait d'une pile de blocs une page.
 */
export default function JournalPage() {
  const today = todayLocalISODate();
  const [day, setDay] = useState(today);
  const { entries, upcoming, loading, createEntry, updateEntry, deleteEntry } =
    useJournal(day);
  const { tags, createTag, setJournalEntryTags } = useTags();

  const [focus, setFocus] = useState<{ id: string; caret: Caret } | null>(null);
  const [saving, setSaving] = useState<Saving>("idle");

  const isToday = day === today;
  const dateLabel = format(parseLocalISODate(day), "EEEE d MMMM yyyy", {
    locale: fr,
  });

  /** Enveloppe une mutation pour que l'indicateur d'enregistrement la suive. */
  const track = useCallback(async <T,>(work: Promise<T>): Promise<T> => {
    setSaving("saving");
    try {
      const result = await work;
      setSaving("saved");
      return result;
    } catch (error) {
      setSaving("idle");
      throw error;
    }
  }, []);

  // Une reprise se calcule sur la LISTE (il faut le bloc précédent), jamais
  // dans le bloc lui-même.
  const reprises = useMemo(
    () =>
      entries.map((entry, i) => {
        if (i === 0) return true;
        const ecart =
          new Date(entry.written_at).getTime() -
          new Date(entries[i - 1].written_at).getTime();
        return ecart > REPRISE_MS;
      }),
    [entries],
  );

  const ecrireIci = async () => {
    const entry = await track(createEntry({ target_day: day, content: "" }));
    setFocus({ id: entry.id, caret: "start" });
  };

  /**
   * Entrée : ce qui suit le curseur part dans un nouveau bloc.
   *
   * L'heure du nouveau bloc n'est PAS toujours maintenant. Couper un bloc en
   * deux ne crée pas une écriture nouvelle : la seconde moitié est du texte
   * déjà écrit, elle hérite donc de l'heure de son origine. Sans ça, couper le
   * bloc de 8 h à 14 h enverrait sa moitié en bas de la page.
   */
  const scinder = async (
    entry: (typeof entries)[number],
    avant: string,
    apres: string,
  ) => {
    if (avant !== entry.content) {
      await track(updateEntry(entry.id, { content: avant }));
    }
    const cree = await track(
      createEntry({
        target_day: day,
        content: apres,
        ...(apres ? { written_at: entry.written_at } : {}),
      }),
    );
    setFocus({ id: cree.id, caret: "start" });
  };

  /**
   * Retour arrière collé au début : le bloc rejoint le précédent.
   *
   * Le geste est une frappe, pas une suppression — mais il EFFACE une ligne.
   * Rien ne doit se perdre en silence : le texte est recollé, les tags du bloc
   * absorbé rejoignent ceux du précédent, et c'est l'heure du PREMIER qui est
   * conservée (le passage appartient au moment où il a commencé).
   */
  const fusionner = async (index: number, contenu: string) => {
    if (index === 0) return;
    const entry = entries[index];
    const precedent = entries[index - 1];
    const jointure = precedent.content.length;

    await track(
      updateEntry(precedent.id, { content: precedent.content + contenu }),
    );
    if (entry.tags.length > 0) {
      const fusion = [
        ...new Set([
          ...precedent.tags.map((t) => t.id),
          ...entry.tags.map((t) => t.id),
        ]),
      ];
      await track(setJournalEntryTags(precedent.id, fusion));
    }
    await track(deleteEntry(entry.id));
    setFocus({ id: precedent.id, caret: jointure });
  };

  const traverser = (index: number, dir: -1 | 1) => {
    const voisin = entries[index + dir];
    if (!voisin) return;
    setFocus({ id: voisin.id, caret: dir === -1 ? "end" : "start" });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden px-8">
      {/* Le SEUL filet de la page : il sépare le chrome du texte. */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-4 pt-8">
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
        {/* Il se pose, il ne clignote pas : un journal ne se soumet pas. */}
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground transition-opacity duration-300",
            saving === "idle" ? "opacity-0" : "opacity-100",
          )}
        >
          {saving === "saving" ? "Enregistrement…" : "Enregistré"}
        </span>
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-10 pt-6">
        {/* La colonne de texte, décalée pour laisser sa gouttière aux heures. */}
        <div className="max-w-[62ch] md:ml-[104px]">
          {loading ? (
            <div className="flex flex-col gap-4">
              {[0.9, 0.6].map((opacity) => (
                <Skeleton key={opacity} className="h-5 w-full" style={{ opacity }} />
              ))}
            </div>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {entries.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={spring.smooth}
                    // Des paragraphes, pas des cartes : l'espacement d'un
                    // texte suivi, un peu d'air seulement à une reprise.
                    className={cn("mb-[0.35em]", reprises[i] && i > 0 && "mt-[1.5em]")}
                  >
                    <JournalBlock
                      entry={entry}
                      targetDay={day}
                      sessionStart={reprises[i]}
                      allTags={tags}
                      focus={focus?.id === entry.id ? focus.caret : null}
                      onFocused={() => setFocus(null)}
                      onChange={(content) =>
                        void track(updateEntry(entry.id, { content }))
                      }
                      onSplit={(avant, apres) => void scinder(entry, avant, apres)}
                      onMergeUp={(contenu) => void fusionner(i, contenu)}
                      onStep={(dir) => traverser(i, dir)}
                      onChangeTags={(tagIds) =>
                        void track(setJournalEntryTags(entry.id, tagIds))
                      }
                      onCreateTag={(name) => createTag({ name }).then((t) => t.id)}
                      onDelete={() => void track(deleteEntry(entry.id))}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Une page blanche est intimidante là où une barre d'une ligne
                  ne l'est pas : elle ne reste jamais nue. */}
              {entries.length === 0 && (
                <p className="text-[1.0625rem] leading-[1.78] text-muted-foreground/80">
                  {isToday
                    ? "Rien pour l'instant. Cette page t'attend."
                    : "Rien écrit ce jour-là — tu peux l'écrire maintenant, l'heure réelle sera gardée."}
                </p>
              )}

              {/* Écrire ici : la porte, quand le clavier ne suffit pas. */}
              <button
                type="button"
                onClick={() => void ecrireIci()}
                className="mt-3 flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left text-[1.0625rem] leading-[1.78] text-muted-foreground/60 outline-none transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <NotebookPen size={16} className="shrink-0" />
                Écrire…
              </button>
            </>
          )}

          {/* Seulement sur aujourd'hui : sur un autre jour, un bloc à venir
              apparaît déjà dans le fil de SA page. */}
          {isToday && upcoming.length > 0 && (
            <div className="mt-14">
              <h2 className="pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Écrit pour plus tard
              </h2>
              <ul className="flex flex-col gap-0.5">
                {upcoming.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setDay(entry.target_day)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-foreground/[0.03]"
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
      </div>
    </div>
  );
}
