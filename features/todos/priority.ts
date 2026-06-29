import type { Priority } from "./types";

/** Ordre d'affichage des priorités (high en premier). */
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Couleur de l'anneau de la checkbox selon la priorité — la priorité est
 * signalée de façon intégrée et discrète, sans badge ni barre.
 */
export function priorityRingColor(priority: Priority): string {
  switch (priority) {
    case "high":
      return "#ef4444"; // red-500
    case "low":
      return "#10b981"; // emerald-500
    default:
      return "var(--color-muted-foreground)";
  }
}
