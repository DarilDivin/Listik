"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OrbeActivite } from "@/components/assistant/OrbeActivite";
import { phrase, useActivite } from "@/features/assistant/activite";

/**
 * La bulle de réflexion de la barre rapide (mode Question,
 * `app/quick/page.tsx`) : la barre se contracte en une capsule où un orbe
 * montre ce que fait VRAIMENT l'Assistant — il réfléchit, il parcourt tes
 * tâches, il crée quelque chose — et une courte phrase le dit en mots. Une
 * animation seule ne se lit pas ; avec trois mots, on comprend.
 *
 * La capsule ÉPOUSE son contenu : la bulle mesure la largeur naturelle de
 * l'orbe et de sa phrase et la donne à la page, qui y amène la forme en
 * s'animant. Quand la phrase change, la capsule s'allonge ou se resserre
 * avec elle — une largeur fixe laissait un grand vide après « Réfléchit… ».
 *
 * Montée au moment où la question part : l'activité démarre à « réfléchit »
 * (voir `features/assistant/activite.ts`).
 *
 * Pas de bouton d'annuler ici, volontairement (décision utilisateur,
 * 2026-09-16) : c'est un processus de réflexion, pas une action qu'on
 * interrompt.
 */
export function QuickBubble({ onLargeur }: { onLargeur?: (largeur: number) => void }) {
  const activite = useActivite();
  const texte = phrase(activite);
  const contenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contenuRef.current;
    if (!el || !onLargeur) return;
    const mesurer = () => onLargeur(Math.ceil(el.getBoundingClientRect().width));
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    mesurer();
    return () => observateur.disconnect();
  }, [onLargeur]);

  return (
    <div
      ref={contenuRef}
      // `w-max` : la largeur NATURELLE, que la capsule soit encore plus
      // étroite (en pleine métamorphose) ou déjà plus large.
      className="flex h-16 w-max items-center gap-1.5 pr-6 pl-1"
      role="status"
      aria-live="polite"
    >
      <div className="grid size-16 shrink-0 place-items-center">
        <OrbeActivite activite={activite} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={texte}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm whitespace-nowrap text-muted-foreground"
        >
          {texte}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
