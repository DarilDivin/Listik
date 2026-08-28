"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { JournalDayCount } from "@/features/journal/types";

interface JournalDensityProps {
  /** Mois affiché, `YYYY-MM`. */
  month: string;
  counts: JournalDayCount[];
  /** Jour ouvert dans la page — il porte l'anneau. */
  selected: string;
  onPick: (day: string) => void;
}

/** Nombre de jours du mois, sans dépendre d'une bibliothèque de dates. */
function joursDuMois(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Le rythme d'écriture du mois, en une bande de points.
 *
 * C'est ce qu'on met à la place d'une SÉRIE. Une série est une mécanique de
 * jeu : on rate un jour, le compteur tombe, et on écrit du remplissage pour le
 * sauver. Le calendrier dit la même chose — où l'on a écrit, où l'on n'a pas —
 * sans rien à casser. Un jour manqué y est un point clair, pas un échec.
 */
export function JournalDensity({
  month,
  counts,
  selected,
  onPick,
}: JournalDensityProps) {
  // Les jours sans bloc ne sont pas renvoyés par la requête : c'est ici qu'on
  // dessine les creux, parce qu'on connaît la longueur du mois.
  const parJour = new Map(counts.map((c) => [c.day, Number(c.count)]));
  const total = joursDuMois(month);

  return (
    <div
      className="flex items-center gap-[3px]"
      role="group"
      aria-label={`Écriture de ${format(new Date(`${month}-01T00:00:00`), "MMMM yyyy", { locale: fr })}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const jour = `${month}-${String(i + 1).padStart(2, "0")}`;
        const n = parJour.get(jour) ?? 0;
        const actif = jour === selected;
        return (
          <button
            key={jour}
            type="button"
            onClick={() => onPick(jour)}
            aria-label={
              n === 0
                ? `${i + 1} : rien écrit`
                : `${i + 1} : ${n} bloc${n > 1 ? "s" : ""}`
            }
            aria-current={actif ? "date" : undefined}
            // La cible dépasse le point : sept pixels de large ne se cliquent
            // pas, seize de haut oui.
            className="group/jour flex h-4 w-[7px] items-center justify-center rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "size-[6px] rounded-[2px] transition-colors duration-200 group-hover/jour:opacity-80",
                n === 0 && "bg-foreground/[0.12]",
                n === 1 && "bg-brand/35",
                n >= 2 && n <= 3 && "bg-brand/65",
                n >= 4 && "bg-brand",
                actif && "outline outline-2 outline-offset-2 outline-brand",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
