"use client";

import { AnimatePresence, motion } from "motion/react";
import { OrbeActivite } from "@/components/assistant/OrbeActivite";
import { phrase, useActivite } from "@/features/assistant/activite";

/**
 * Attente de la réponse, dans le fil de la conversation (page Assistant et
 * relances de la barre rapide) : l'orbe en petit — la taille 20 de
 * `thinking-orbs`, dessinée pour s'aligner sur une ligne de texte — et la
 * phrase qui dit ce que fait VRAIMENT l'Assistant (voir
 * `features/assistant/activite.ts`). L'appel dure plusieurs secondes : trois
 * mots disent mieux qu'une animation ce qui se passe.
 *
 * Monté quand la question part : l'activité démarre à « réfléchit ».
 * (`.shimmer` est défini dans `globals.css`.)
 */
export function ThinkingIndicator() {
  const activite = useActivite();
  const texte = phrase(activite);

  return (
    <div className="flex items-center gap-2 px-1" role="status" aria-live="polite">
      <OrbeActivite activite={activite} taille={20} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={texte}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="shimmer text-[15px] text-muted-foreground"
        >
          {texte}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
