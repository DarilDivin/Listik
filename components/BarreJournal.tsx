"use client";

import { useEffect, useRef } from "react";
import { Cancel01Icon, ExternalLinkIcon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/ui/app-icon";
import { JournalSheet } from "@/components/journal/JournalSheet";
import { useFeuille } from "@/features/journal/useFeuille";
import { todayLocalISODate } from "@/lib/date";

interface BarreJournalProps {
  /** Pose le curseur au bout de la feuille au montage. */
  autoFocus?: boolean;
  /**
   * Icône de tête, à côté de la date. Absente par défaut — le widget de
   * l'accueil n'en a pas besoin ; seule la fenêtre rapide en pose une
   * (cliquable, pour redonner la main aux pastilles).
   */
  leading?: React.ReactNode;
  /** Ouvre la page Journal dans la fenêtre principale. */
  onOpenInJournal?: () => void;
  /** Ferme la fenêtre rapide sans quitter l'application. */
  onClose?: () => void;
}

/**
 * La feuille du jour dans la fenêtre rapide. Le Journal est un document à
 * poursuivre : il emploie donc la variante page complète, jamais le widget
 * d'aperçu de l'accueil.
 *
 * Même moteur que la page complète (`JournalSheet`/`useFeuille`) : écrire ici
 * prolonge la même journée, sans une troisième représentation des données.
 */
export default function BarreJournal({
  autoFocus,
  leading,
  onOpenInJournal,
  onClose,
}: BarreJournalProps) {
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
      className="flex h-full w-full flex-col overflow-hidden rounded-[inherit] bg-transparent"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3">
        {leading}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none text-foreground">Journal</p>
          <p className="mt-1 text-[11px] leading-none text-muted-foreground">{jour}</p>
        </div>
        <span className="ml-auto" />
        {onOpenInJournal && (
          <button
            type="button"
            onClick={onOpenInJournal}
            title="Ouvrir le Journal"
            aria-label="Ouvrir le Journal"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2"
          >
            <AppIcon icon={ExternalLinkIcon} size={16} />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2"
          >
            <AppIcon icon={Cancel01Icon} size={16} />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto min-h-full w-full max-w-[44rem]">
          <JournalSheet
            variant="page"
            reprises={reprises}
            aStamper={aStamper}
            onSegments={(segments) => void enregistrer(segments)}
            invite={
              <p className="text-[0.9375rem] leading-[1.78] text-muted-foreground/60">
                Écrire…
              </p>
            }
            className="min-h-full pb-16"
          />
        </div>
      </div>
    </div>
  );
}
