"use client";

import { useEffect, useRef } from "react";
import { JournalSheet } from "@/components/journal/JournalSheet";
import { useFeuille } from "@/features/journal/useFeuille";
import { todayLocalISODate } from "@/lib/date";

interface BarreJournalProps {
  /** Pose le curseur au bout de la feuille au montage. */
  autoFocus?: boolean;
}

/**
 * La feuille du jour, en petit — issue du découpage de l'ancien Omnibar à
 * modes (voir docs/ROADMAP-BARRES.md, étape 3). Pas une extraction : `/note`
 * n'était qu'une ligne, et le vrai geste du Journal est de reprendre le fil,
 * pas d'écrire dans le vide (voir « Décisions supplémentaires » du roadmap).
 *
 * Même composant que la page complète et que le widget de l'accueil — UN
 * SEUL moteur de feuille (`JournalSheet`/`useFeuille`), pas un troisième
 * rendu de la même journée. `variant="widget"` + `className="journal-widget"`
 * donnent déjà le plafond de quatre lignes et la gouttière resserrée dont
 * cette barre a besoin : rien à régler ici, `JournalWidget` l'a déjà validé
 * sur l'accueil.
 */
export default function BarreJournal({ autoFocus }: BarreJournalProps) {
  const today = todayLocalISODate();
  // Pas de « À venir » ici, comme le widget : cette barre ne montre que le
  // jour courant, écrire pour plus tard se fait depuis la page complète.
  const { reprises, aStamper, enregistrer } = useFeuille(today, false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const zone = rootRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!zone) return;
    zone.focus();
    // Au bout de la feuille, pas au début : on arrive pour continuer d'écrire.
    const s = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(zone);
    r.collapse(false);
    s?.removeAllRanges();
    s?.addRange(r);
  }, [autoFocus]);

  // Capitaliser seulement le premier caractère : "long" rend "mercredi 16
  // septembre" en minuscules, et le nom de mois doit le rester (contrairement
  // à ce que ferait `capitalize` en CSS, qui majusculerait aussi "Septembre").
  const jourBrut = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const jour = jourBrut.charAt(0).toUpperCase() + jourBrut.slice(1);

  return (
    <div
      ref={rootRef}
      className="rounded-2xl border border-border/60 bg-popover p-4"
    >
      <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
        {jour}
      </p>
      <JournalSheet
        variant="widget"
        reprises={reprises}
        aStamper={aStamper}
        onSegments={(segments) => void enregistrer(segments)}
        invite={
          <p className="text-[0.9375rem] leading-[1.78] text-muted-foreground/60">
            Écrire…
          </p>
        }
        className="journal-widget"
      />
    </div>
  );
}
