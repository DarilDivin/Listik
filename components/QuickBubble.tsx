"use client";

import { motion } from "motion/react";

const DOTS = [
  { color: "#7c3aed", delay: 0 },
  { color: "#8b5cf6", delay: -0.7 },
  { color: "#a78bfa", delay: -1.4 },
];

/**
 * La bulle de réflexion (mode Question, `app/quick/page.tsx`) — un cercle de
 * 64px, réutilisant le MÊME filtre gooey que `QuickPills` (`#quick-gooey`,
 * déjà posé dans le DOM puisque les pastilles restent montées, juste
 * repliées). Trois gouttes qui dérivent au lieu de trois icônes qui se
 * posent — même matière, autre histoire (docs/ROADMAP-BARRES.md, étape 4,
 * troisième sous-étape).
 *
 * Pas de bouton d'annuler ici, volontairement (décision utilisateur,
 * 2026-09-16) : c'est un processus de réflexion, pas une action qu'on
 * interrompt. À rouvrir si l'usage réel montre que la latence (~12s) le
 * demande.
 */
export function QuickBubble() {
  return (
    <div className="grid h-16 w-16 place-items-center">
      <div className="relative h-8 w-8" style={{ filter: "url(#quick-gooey)" }}>
        {DOTS.map((dot, i) => (
          <motion.span
            key={i}
            className="absolute size-3.5 rounded-full"
            style={{ backgroundColor: dot.color, left: "50%", top: "50%", marginLeft: -7, marginTop: -7 }}
            animate={{
              x: [-6, 4, 6, -5, -6],
              y: [0, -6, 4, 5, 0],
              scale: [1, 0.85, 1.12, 0.9, 1],
            }}
            transition={{
              duration: 2.2,
              delay: dot.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
