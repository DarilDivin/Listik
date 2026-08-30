"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { journalApi } from "@/features/journal/api";
import { SWR_KEYS } from "@/lib/swr-config";
import { useTags } from "@/hooks/useTags";
import { JournalBlock, type Caret } from "@/components/journal/JournalBlock";
import { JournalDensity } from "@/components/journal/JournalDensity";
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
 * Même jour, un an plus tôt. Le 29 février n'existe pas tous les ans : on
 * retombe alors sur le 28, plutôt que de laisser JavaScript glisser au
 * 1er mars sans le dire.
 */
function unAnAvant(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const cible = new Date(y - 1, m - 1, d);
  const jour = cible.getMonth() === m - 1 ? d : 28;
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
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

  const [focus, setFocus] = useState<{
    id: string;
    caret: Caret;
    contenu?: string;
  } | null>(null);
  const [saving, setSaving] = useState<Saving>("idle");

  // Le même jour, un an plus tôt. Une seule requête, la même commande que la
  // page — et la section disparaît quand il n'y avait rien.
  // Le mois affiche, pour la bande de densite de l'en-tete.
  const mois = day.slice(0, 7);
  const { data: densite = [] } = useSWR(
    SWR_KEYS.JOURNAL_MONTH(mois),
    () => journalApi.countByMonth(mois),
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );

  const jourDAvant = unAnAvant(day);
  const { data: ilYaUnAn = [] } = useSWR(
    SWR_KEYS.JOURNAL_DAY(jourDAvant),
    () => journalApi.listForDay(jourDAvant),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const isToday = day === today;
  const date = parseLocalISODate(day);
  // La date se lit en trois temps, comme dans le hero du planificateur : le
  // jour de la semaine en accent, la date en grand, l'année en retrait.
  const jourSemaine = format(date, "EEEE", { locale: fr });
  const jourMois = format(date, "d MMMM", { locale: fr });
  const annee = format(date, "yyyy");

  /**
   * Enveloppe une mutation pour que l'indicateur d'enregistrement la suive.
   *
   * Ne rejette JAMAIS : tous les appels d'ici sont en `void` (on écrit, on
   * n'attend pas), donc re-lever ne ferait qu'un rejet non capturé de plus.
   * `useJournalMutations` a déjà prévenu par un toast — le seul travail qui
   * reste est de rendre l'échec lisible à l'appelant, d'où le `null`.
   */
  const track = useCallback(async <T,>(work: Promise<T>): Promise<T | null> => {
    setSaving("saving");
    try {
      const result = await work;
      setSaving("saved");
      return result;
    } catch {
      setSaving("idle");
      return null;
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

  /** Un bloc vide attend déjà au bas de la page : c'est là qu'on écrit. */
  const dernierVide =
    entries.length > 0 && !entries[entries.length - 1].content.trim();

  const ecrireIci = async () => {
    const entry = await track(createEntry({ target_day: day, content: "" }));
    if (entry) setFocus({ id: entry.id, caret: "start" });
  };

  /**
   * Entrée : ce qui suit le curseur part dans un nouveau bloc.
   *
   * Le nouveau bloc hérite TOUJOURS de l'heure de son origine, et le tri par
   * `created_at` le pose juste après elle.
   *
   * Parce qu'Entrée veut dire « je continue ICI ». Daté de maintenant, il
   * partait en bas de la page : on ne pouvait plus rien intercaler dans sa
   * journée. Écrire… en pied de page reste le geste qui crée un bloc à
   * l'heure réelle — les deux intentions ont chacune leur porte.
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
        written_at: entry.written_at,
      }),
    );
    if (cree) setFocus({ id: cree.id, caret: "start" });
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
    // Deux paragraphes se recollent avec une ligne vide entre eux, sinon le
    // markdown les souderait en un seul.
    const fusionne = precedent.content
      ? contenu
        ? `${precedent.content}\n\n${contenu}`
        : precedent.content
      : contenu;

    await track(updateEntry(precedent.id, { content: fusionne }));
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
    // On donne le texte fusionné AVEC la demande de focus : l'éditeur du bloc
    // précédent est déjà monté, il ne se rechargerait pas tout seul. Et lui
    // seul sait où est la jointure — la page ne voit que du markdown, dont la
    // longueur n'est pas celle du texte affiché.
    setFocus({ id: precedent.id, caret: "junction", contenu: fusionne });
  };

  const traverser = (index: number, dir: -1 | 1) => {
    const voisin = entries[index + dir];
    if (!voisin) return;
    setFocus({ id: voisin.id, caret: dir === -1 ? "end" : "start" });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden px-8">
      {/* Le SEUL filet de la page : il sépare le chrome du texte. */}
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5 pt-8">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
            {jourSemaine}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <h1 className="text-[1.75rem] font-bold leading-none tracking-[-0.025em] text-foreground">
              {jourMois}
              <span className="ml-2 font-medium text-muted-foreground/55">
                {annee}
              </span>
            </h1>
            {/* Les flèches suivent la date au lieu de l'encadrer : elles la
                font défiler, elles ne la contiennent pas. */}
            <span className="flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Jour précédent"
                onClick={() => setDay((d) => shiftDay(d, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Jour suivant"
                onClick={() => setDay((d) => shiftDay(d, 1))}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
          <div className="mt-3">
            <JournalDensity
              month={mois}
              counts={densite}
              selected={day}
              onPick={setDay}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 pt-1">
          {/* Il se pose, il ne clignote pas : un journal ne se soumet pas. */}
          <span
            className={cn(
              "text-xs text-muted-foreground transition-opacity duration-300",
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10 pt-6">
        {/* La colonne de texte, décalée pour laisser sa gouttière aux heures. */}
        <div className="max-w-[68ch] md:ml-[104px]">
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
                      focus={
                        focus?.id === entry.id
                          ? { caret: focus.caret, contenu: focus.contenu }
                          : null
                      }
                      onFocused={() => setFocus(null)}
                      onChange={(content) =>
                        void track(updateEntry(entry.id, { content }))
                      }
                      // Un bloc vide qu'on quitte n'a rien à dire : il part.
                      // Sinon la page accumulerait les lignes créées par une
                      // Entrée de trop.
                      onBlur={(content) => {
                        if (!content.trim()) void track(deleteEntry(entry.id));
                      }}
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

              {/* Écrire ici : la porte, quand le clavier ne suffit pas.
                  Pas d'icône, pas de cadre : c'est la ligne suivante de la
                  page, pas un bouton.

                  Elle s'efface quand le dernier bloc est déjà vide : ce bloc
                  EST l'endroit où écrire, et il porte le même « Écrire… ». On
                  voyait l'invitation en double, une fois en place de curseur
                  et une fois en promesse. */}
              {!dernierVide && (
                <button
                  type="button"
                  onClick={() => void ecrireIci()}
                  className="w-full rounded-sm py-0.5 text-left text-[1.0625rem] leading-[1.78] text-muted-foreground/50 outline-none transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Écrire…
                </button>
              )}
            </>
          )}

          {/* Il y a un an. Séparé par de l'ESPACE, pas par un filet : le gris
              et la distance disent déjà que ce n'est plus aujourd'hui. */}
          {ilYaUnAn.length > 0 && (
            <section className="mt-16">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Il y a un an
                <span className="ml-2.5 font-mono text-[11px] font-normal normal-case tracking-normal">
                  {format(parseLocalISODate(jourDAvant), "d MMMM yyyy", {
                    locale: fr,
                  })}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setDay(jourDAvant)}
                className="mt-2.5 flex w-full flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ilYaUnAn.slice(0, 3).map((bloc) => (
                  <p
                    key={bloc.id}
                    className="text-[0.9375rem] leading-relaxed text-foreground/65"
                  >
                    {bloc.content.split("\n")[0] || "Bloc vide"}
                  </p>
                ))}
                {ilYaUnAn.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    et {ilYaUnAn.length - 3} autre
                    {ilYaUnAn.length - 3 > 1 ? "s" : ""}…
                  </span>
                )}
              </button>
            </section>
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
