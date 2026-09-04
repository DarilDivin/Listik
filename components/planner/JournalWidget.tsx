"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { JournalSheet } from "@/components/journal/JournalSheet";
import { useFeuille } from "@/features/journal/useFeuille";
import { useShortcut } from "@/lib/keys";
import { cn } from "@/lib/utils";
import { todayLocalISODate } from "@/lib/date";

export interface JournalWidgetHandle {
  /** Pose le curseur au bout de la journée (raccourci Ctrl+J). */
  open: () => void;
}

/**
 * Le journal d'aujourd'hui, au bas de l'accueil.
 *
 * C'est la MÊME feuille que la page-jour — même composant, même découpage en
 * reprises, même sauvegarde (`useFeuille`). L'ancien widget avait son propre
 * moteur de rendu et découpait par paragraphe : les deux surfaces racontaient
 * deux histoires différentes de la même journée.
 *
 * Ce qui change ici est une question de PLACE, pas de nature : le texte est
 * estompé au repos et remonte quand on y entre, il est plafonné à quatre
 * lignes et défile à l'intérieur. Aucun cadre, aucun fond — le texte reste
 * posé sur la page, comme partout ailleurs dans l'app.
 *
 * Le seul filet est celui qui sépare déjà le journal des tâches ; il prend
 * l'accent quand on écrit. Un trait qui existe, pas une boîte de plus.
 */
export const JournalWidget = forwardRef<JournalWidgetHandle>(
  function JournalWidget(_props, ref) {
    const today = todayLocalISODate();
    // Pas de « À venir » ici : le widget ne montre que le jour courant.
    const { reprises, aStamper, enregistrer } = useFeuille(today, false);
    const racineRef = useRef<HTMLDivElement>(null);
    const raccourci = useShortcut("J");

    useImperativeHandle(ref, () => ({
      open: () => {
        const zone = racineRef.current?.querySelector<HTMLElement>(
          '[contenteditable="true"]',
        );
        if (!zone) return;
        zone.focus();
        // Au BOUT de la journée : Ctrl+J veut dire « écrire maintenant », pas
        // « relire ». Sans ça le curseur tomberait au tout début, sur le
        // premier mot du matin.
        const s = window.getSelection();
        const r = document.createRange();
        r.selectNodeContents(zone);
        r.collapse(false);
        s?.removeAllRanges();
        s?.addRange(r);
        zone.scrollTop = zone.scrollHeight;
      },
    }));

    return (
      <section
        ref={racineRef}
        className="group/journal"
        aria-label="Journal d'aujourd'hui"
      >
        {/* Le SEUL filet : celui qui sépare le journal des tâches. Il prend
            l'accent quand on écrit — rien d'autre ne change de forme. */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-t border-border/60 px-3 pb-2 pt-6",
            "transition-colors duration-300 group-focus-within/journal:border-brand/40",
          )}
        >
          <h3
            className={cn(
              "flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground",
              "transition-colors duration-300 group-focus-within/journal:text-brand",
            )}
          >
            <NotebookPen size={13} className="text-muted-foreground/70" />
            Journal
          </h3>
          <span className="flex items-center gap-3">
            {/* Indice typographique, pas pastille — même retenue que le Ctrl N
                de la rangée de capture, dont le badge plein était l'élément le
                plus lourd d'une rangée qui se veut plate. */}
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground/40 opacity-0 transition-opacity duration-200 group-hover/journal:opacity-100 group-focus-within/journal:opacity-100">
              {raccourci}
            </span>
            <Link
              href="/journal"
              className="text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              Ouvrir
            </Link>
          </span>
        </div>

        <div className="px-3">
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
      </section>
    );
  },
);
