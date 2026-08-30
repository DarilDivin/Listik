"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date";
import { estVide } from "@/features/journal/decoupe";
import type { Caret } from "@/components/journal/JournalEditor";
import type { JournalEntry } from "@/features/journal/types";

export type { Caret };

/**
 * L'éditeur n'est chargé que par la page Journal — même parti que l'Omnibar
 * avec `CaptureField` : rich-text, markdown, listes et liens n'ont rien à
 * faire dans le lot commun.
 */
const JournalEditor = dynamic(
  () => import("@/components/journal/JournalEditor").then((m) => m.JournalEditor),
  {
    ssr: false,
    loading: () => <div className="journal-prose opacity-0">&nbsp;</div>,
  },
);

interface JournalBlockProps {
  entry: JournalEntry;
  /** Jour de la page — pour savoir si le bloc a été écrit un AUTRE jour. */
  targetDay: string;
  /** Demande de focus venue de la page (les flèches, d'une reprise à l'autre). */
  focus: { caret: Caret; contenu?: string } | null;
  onFocused: () => void;
  onChange: (content: string) => void;
  onBlur: (content: string) => void;
  onStep: (dir: -1 | 1) => void;
}

/**
 * Une REPRISE d'écriture de la page-jour — pas un paragraphe.
 *
 * Tant qu'on écrit sans s'interrompre une heure, tout reste ici : Entrée fait
 * un paragraphe, une liste reste une liste, le texte coule comme dans un
 * document. C'est le retour APRÈS une heure qui ouvre le bloc suivant.
 *
 * Rien ne doit signaler qu'un bloc est un bloc : ni cadre, ni fond, ni
 * séparateur, ni contrôle au survol. Seule son heure, dans la gouttière, dit
 * qu'on est revenu.
 */
export function JournalBlock({
  entry,
  targetDay,
  focus,
  onFocused,
  onChange,
  onBlur,
  onStep,
}: JournalBlockProps) {
  // `written_at` est un instant UTC : en tirer le JOUR passe par
  // `toLocalISODate`, jamais par un `slice(0, 10)` sur la chaîne brute (faux
  // près de minuit hors UTC — même piège que dans `lib/date.ts`).
  const writtenAt = new Date(entry.written_at);
  const heure = format(writtenAt, "HH:mm");
  const ailleurs = toLocalISODate(writtenAt) !== targetDay;
  // Chaque bloc EST une reprise : son heure dit quand on s'est remis à
  // écrire, et c'est la seule chose qui distingue un bloc du suivant. Elle
  // reste donc posée, sans qu'on ait à promener la souris.
  const heureFixe = true;

  // La fermeture du bloc : il passe de vide à écrit, donc il vient d'être
  // enregistré. On le dit une fois, par un mouvement — pas par un message.
  const [ferme, setFerme] = useState(false);
  const videAvant = useRef(estVide(entry.content));
  useEffect(() => {
    const vide = estVide(entry.content);
    if (videAvant.current && !vide) {
      setFerme(true);
      const t = setTimeout(() => setFerme(false), 1200);
      videAvant.current = vide;
      return () => clearTimeout(t);
    }
    videAvant.current = vide;
  }, [entry.content]);

  return (
    <div className={cn("group/bloc relative", ferme && "journal-commit")}>
      {/* L'heure vit dans la gouttière, jamais dans le texte. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -left-[104px] top-[0.45em] hidden w-[88px] select-none text-right font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-300 md:block",
          heureFixe ? "opacity-50" : "opacity-0 group-hover/bloc:opacity-80",
          // À la fermeture, l'heure tombe dans la gouttière puis s'en remet à
          // sa règle : c'est le seul moment où on la montre sans la demander.
          ferme && "journal-commit-heure",
        )}
      >
        {heure}
      </span>
      {/* Écrit un autre jour : le seul signe visible d'un bloc antidaté. */}
      {ailleurs && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[104px] top-[2em] hidden w-[88px] select-none text-right text-[10px] leading-tight text-muted-foreground opacity-40 md:block"
        >
          écrit le {format(writtenAt, "d MMM", { locale: fr })}
        </span>
      )}

      <div className="relative">
        <JournalEditor
          markdown={entry.content}
          placeholder={entry.content ? undefined : "Écrire…"}
          focus={focus}
          onFocused={onFocused}
          onChange={onChange}
          onBlur={onBlur}
          onStep={onStep}
        />
      </div>
    </div>
  );
}
