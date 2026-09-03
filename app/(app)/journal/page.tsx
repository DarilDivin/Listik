"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { journalApi } from "@/features/journal/api";
import { SWR_KEYS } from "@/lib/swr-config";
import { JournalSearch } from "@/components/journal/JournalSearch";
import { JournalSheet, type Reprise } from "@/components/journal/JournalSheet";
import { JournalDensity } from "@/components/journal/JournalDensity";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { estVide, type Segment } from "@/features/journal/feuille";
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
 * Au-delà d'une heure sans écrire, on est REVENU : la phrase suivante ouvre un
 * autre moment de la journée. La même règle vit en Rust (`db::REPRISE`), qui
 * reste l'arbitre — ici elle ne sert qu'à savoir s'il faut montrer un repère
 * vierge au bas de la feuille.
 */
const REPRISE_MS = 60 * 60 * 1000;

/**
 * Une page blanche est intimidante là où une question ne l'est pas. On en pose
 * une, et une seule — pas un formulaire d'humeur.
 *
 * Elle change avec le jour, sans hasard : la même date rend toujours la même
 * question, sinon elle sauterait d'un rendu à l'autre sous les yeux.
 */
const QUESTIONS = [
  "Qu'est-ce qui a été plus facile que prévu aujourd'hui ?",
  "Qu'est-ce que tu veux te rappeler de cette journée dans un an ?",
  "Qu'est-ce qui t'a occupé l'esprit sans que tu l'aies décidé ?",
  "Qu'est-ce que tu as évité, et pourquoi ?",
  "Qu'est-ce qui t'a fait rire aujourd'hui ?",
  "De quoi as-tu changé d'avis, même un peu ?",
  "Qu'est-ce qui mérite d'être dit avant que tu l'oublies ?",
];

const questionDuJour = (day: string): string => {
  const somme = [...day].reduce((n, c) => n + c.charCodeAt(0), 0);
  return QUESTIONS[somme % QUESTIONS.length];
};

type Saving = "idle" | "saving" | "saved";

/**
 * La page-jour : un document, pas une liste de blocs surmontée d'un champ de
 * saisie. On écrit, ça s'enregistre — il n'y a rien à soumettre.
 *
 * Ce que la page RETIENT, ce sont les MOMENTS : une ligne en base par reprise
 * d'écriture, pas par paragraphe. Tant qu'on écrit sans s'interrompre une
 * heure, tout va dans la même ligne et le texte y coule normalement — Entrée
 * fait un paragraphe, une liste reste une liste. C'est le retour APRÈS une
 * heure qui ouvre le moment suivant, et son heure dans la gouttière est la
 * seule chose qui le montre.
 *
 * La règle vit en Rust (`db::append_journal_entry`) : la capture rapide écrit
 * dans le même journal, et deux fenêtres décidant chacune sur sa copie de la
 * liste auraient coupé un même moment en deux.
 */
export default function JournalPage() {
  const today = todayLocalISODate();
  const [day, setDay] = useState(today);
  const { entries, upcoming, loading, appendEntry, updateEntry, deleteEntry } =
    useJournal(day);

  // L'identité à poser sur le repère encore vierge, une fois sa ligne créée.
  const [aStamper, setAStamper] = useState<{ id: string; heure: string } | null>(
    null,
  );
  const [saving, setSaving] = useState<Saving>("idle");
  const [cherche, setCherche] = useState(false);

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


  const heureDe = (iso: string) => format(new Date(iso), "HH:mm");

  // Ce qu'on lit sur une journée encore blanche. Les trois cas ne disent pas
  // la même chose : écrire pour aujourd'hui va de soi, revenir sur hier ou
  // prendre de l'avance demandent qu'on dise ce qu'il advient de l'heure.
  const invitation = isToday
    ? "Rien pour l'instant. Cette page t'attend."
    : day > today
      ? "Rien pour l'instant. Cette page t'attend — tu peux même écrire en avance, elle gardera l'heure réelle de l'écriture."
      : "Rien écrit ce jour-là. Tu peux l'écrire maintenant, l'heure réelle sera gardée.";
  const question = questionDuJour(day);

  /**
   * La dernière reprise est-elle encore ouverte ? On mesure sur `updated_at`,
   * la dernière écriture RÉELLE — rester une heure et demie sur un même
   * moment ne doit pas le fermer sous les doigts.
   *
   * Ce calcul double celui de Rust, qui reste l'arbitre : ici il ne sert qu'à
   * savoir s'il faut MONTRER un repère vierge au bas de la feuille.
   */
  const derniere = entries[entries.length - 1];
  const ouverte =
    derniere !== undefined &&
    Date.now() - new Date(derniere.updated_at).getTime() < REPRISE_MS;

  // L'heure du repère vierge se fige à son apparition : la recalculer à chaque
  // rendu changerait la feuille toutes les minutes, et la rechargerait.
  const [heureVierge, setHeureVierge] = useState<string | null>(null);
  useEffect(() => {
    if (isToday && !ouverte) {
      setHeureVierge((h) => h ?? format(new Date(), "HH:mm"));
    } else {
      setHeureVierge(null);
    }
  }, [isToday, ouverte]);

  const reprises = useMemo<Reprise[]>(() => {
    const posees = entries.map((e) => ({
      id: e.id,
      heure: heureDe(e.written_at),
      markdown: e.content,
    }));
    // « Ici commence maintenant » : une promesse, pas encore une ligne en base.
    if (heureVierge !== null) posees.push({ id: "", heure: heureVierge, markdown: "" });
    return posees;
  }, [entries, heureVierge]);

  // La sauvegarde compare aux entrées SANS se réabonner à chaque frappe.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /**
   * La feuille a changé : on écrit ce qui a bougé, reprise par reprise.
   *
   * Une reprise vidée s'en va — c'est le seul geste de suppression, et il ne
   * demande rien de plus que d'effacer son texte. Un repère disparu (Retour
   * arrière sur la frontière) fait de même : sa ligne part, son texte ayant
   * déjà rejoint celle d'avant.
   */
  const enregistrer = useCallback(
    async (segments: Segment[]) => {
      const connues = entriesRef.current;
      const vues = new Set<string>();

      for (const s of segments) {
        if (s.entryId === "") {
          if (estVide(s.markdown)) continue;
          const cree = await track(appendEntry(day, s.markdown));
          if (cree) setAStamper({ id: cree.id, heure: heureDe(cree.written_at) });
          continue;
        }
        vues.add(s.entryId);
        const avant = connues.find((e) => e.id === s.entryId);
        if (avant === undefined) continue;
        if (estVide(s.markdown)) {
          await track(deleteEntry(s.entryId));
          continue;
        }
        if (s.markdown !== avant.content) {
          await track(updateEntry(s.entryId, { content: s.markdown }));
        }
      }

      for (const e of connues) {
        if (!vues.has(e.id)) await track(deleteEntry(e.id));
      }
    },
    [day, track, appendEntry, updateEntry, deleteEntry],
  );

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
          {/* Le premier des outils de l'en-tête. Les quatre autres (pièces
              jointes, musique, verrou, export) viendront à côté. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Chercher dans le journal"
            data-actif={cherche || undefined}
            onClick={() => setCherche((c) => !c)}
            className="data-[actif]:bg-brand-soft data-[actif]:text-brand"
          >
            <Search />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10 pt-6">
        {/* La colonne de texte, décalée pour laisser sa gouttière aux heures. */}
        <div className="max-w-[68ch] md:ml-[104px]">
          {cherche ? (
            <JournalSearch
              onPick={(jour) => {
                setDay(jour);
                setCherche(false);
              }}
              onClose={() => setCherche(false)}
            />
          ) : loading ? (
            <div className="flex flex-col gap-4">
              {[0.9, 0.6].map((opacity) => (
                <Skeleton key={opacity} className="h-5 w-full" style={{ opacity }} />
              ))}
            </div>
          ) : (
            <JournalSheet
              key={day}
              reprises={reprises}
              aStamper={aStamper}
              invite={
                <div className="flex flex-col gap-4">
                  <p className="text-[1.0625rem] leading-[1.78] text-foreground/[0.66]">
                    {invitation}
                  </p>
                  <p className="text-[0.9375rem] italic text-muted-foreground">
                    « {question} »
                  </p>
                </div>
              }
              onSegments={(segments) => void enregistrer(segments)}
            />
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
