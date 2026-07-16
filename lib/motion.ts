import type { Transition, Variants } from "motion/react";

/**
 * Presets de ressort façon iOS/macOS. Le mouvement « organique » d'Apple vient
 * d'une physique (raideur / amortissement / masse), pas d'une durée fixe : ça
 * accélère et se *stabilise* naturellement, avec un léger dépassement. À
 * réutiliser partout pour un feel cohérent — jamais de transition inline ad hoc.
 *
 * Registre « pro premium » (Linear/Things/Raycast), pas ludique : ratio
 * d'amortissement ζ ≈ 0.85–0.95 pour l'essentiel (dépassement à peine
 * perceptible), ζ ≈ 0.7 tout au plus pour un unique moment signature.
 */
export const spring = {
  /** Réactif, quasi sans rebond (ζ≈0.83) — boutons, toggles, micro-interactions. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },
  /** Doux et posé (ζ≈0.92) — le cheval de bataille : layout, panneaux, entrées de contenu. */
  smooth: { type: "spring", stiffness: 300, damping: 32 },
  /** Du caractère (ζ≈0.69) — réservé à 1-2 moments signature (célébration, capture). */
  bouncy: { type: "spring", stiffness: 440, damping: 29 },
  /** Très calme (ζ≈1.0) — grands mouvements, listes. */
  gentle: { type: "spring", stiffness: 210, damping: 30 },
  /** Entrée « pop » des widgets/cartes bento (ζ≈0.70) : arrive avec du caractère. */
  pop: { type: "spring", stiffness: 380, damping: 26, mass: 0.9 },
} satisfies Record<string, Transition>;

/**
 * Sortie : tween qui *accélère* (ease-in), jamais de ressort — un ressort a
 * une queue invisible avant le repos et le démontage attend cette fin, en
 * plus d'un risque de rebond qui lit comme « indécis ». Toujours ~60-70 % de
 * la durée d'entrée. Même vocabulaire spatial que l'entrée (mêmes propriétés),
 * à mi-amplitude — la sortie n'est jamais juste un fondu isolé.
 */
export const exitTween: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };

/** Retour tactile (échelle à l'appui) façon iOS — à étaler sur un `motion.*`. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;

/**
 * Variants d'une ligne de liste (tâche, ligne compacte…) : entrée qui
 * décélère en ressort, sortie qui accélère en tween — même vocabulaire (y +
 * scale), amplitude de sortie réduite de moitié, jamais de rebond au départ.
 * Transitions par propriété (spring sur le transform, tween sur l'opacity :
 * un spring sur l'opacity scintille en fin de course).
 * À utiliser avec `layout` sur le `motion.div` et `mode="popLayout"` sur
 * l'`AnimatePresence` englobant, pour que les voisins se referment en ressort
 * quand une ligne disparaît — le geste le plus répété de l'app.
 */
export const rowVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { opacity: { duration: 0.2 }, default: spring.smooth },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.98,
    transition: { opacity: { duration: 0.14 }, default: exitTween },
  },
};

/**
 * Comme `rowVariants`, mais l'entrée est échelonnée par `custom` (index de
 * l'élément) — pour une cascade d'apparition (paquets Zoom/Stratigraphie,
 * sections). La sortie reste volontairement groupée (pas de stagger) : à la
 * fermeture, l'attention va au nouvel état, pas à ce qui part.
 */
export const staggerRowVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      opacity: { duration: 0.22, delay: Math.min(i * 0.035, 0.28) },
      default: { ...spring.smooth, delay: Math.min(i * 0.035, 0.28) },
    },
  }),
  exit: {
    opacity: 0,
    y: 4,
    transition: { opacity: { duration: 0.14 }, default: exitTween },
  },
};

/**
 * Variants d'un élément qui apparaît/disparaît sur place (contrôle facultatif
 * d'une ligne de tâche, bouton révélé au survol…) : léger zoom, pas de
 * translation — l'élément « éclot » depuis son point d'ancrage.
 */
export const revealVariants: Variants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};
