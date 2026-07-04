import type { Transition } from "motion/react";

/**
 * Presets de ressort façon iOS/macOS. Le mouvement « organique » d'Apple vient
 * d'une physique (raideur / amortissement / masse), pas d'une durée fixe : ça
 * accélère et se *stabilise* naturellement, avec un léger dépassement. À
 * réutiliser partout pour un feel cohérent.
 */
export const spring = {
  /** Réactif, quasi sans rebond — boutons, toggles, micro-interactions. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },
  /** Doux et posé — transitions de layout, panneaux, entrées de contenu. */
  smooth: { type: "spring", stiffness: 300, damping: 32 },
  /** Du caractère — éléments qui « arrivent » (feuilles, badges). */
  bouncy: { type: "spring", stiffness: 440, damping: 22 },
  /** Très calme — grands mouvements, listes. */
  gentle: { type: "spring", stiffness: 210, damping: 30 },
} satisfies Record<string, Transition>;

/** Retour tactile (échelle à l'appui) façon iOS — à étaler sur un `motion.*`. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;
