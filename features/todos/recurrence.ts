// Miroir TypeScript de la logique Rust (Recurrence::advance) pour les mises à
// jour optimistes. La source de vérité reste le backend ; on duplique ici le
// calcul de la prochaine occurrence pour afficher le report sans attendre l'IPC.
import type { Recurrence } from "./types";

/** Date « jour seul » locale au format YYYY-MM-DD (sans décalage UTC). */
function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Jamais",
  daily: "Tous les jours",
  weekdays: "Jours ouvrés",
  weekly: "Toutes les semaines",
  monthly: "Tous les mois",
};

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = (
  ["none", "daily", "weekdays", "weekly", "monthly"] as Recurrence[]
).map((value) => ({ value, label: RECURRENCE_LABELS[value] }));

export function recurrenceLabel(recurrence: Recurrence): string {
  return RECURRENCE_LABELS[recurrence];
}

function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Prochaine occurrence (YYYY-MM-DD) après `from` selon la récurrence.
 * `from` null → on part d'aujourd'hui. `none` → renvoie `from` inchangé.
 */
export function nextOccurrence(from: string | null, recurrence: Recurrence): string {
  const base = from ? parseLocalISODate(from) : new Date();

  switch (recurrence) {
    case "daily":
      base.setDate(base.getDate() + 1);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
    case "monthly":
      base.setMonth(base.getMonth() + 1);
      break;
    case "weekdays":
      base.setDate(base.getDate() + 1);
      while (base.getDay() === 0 || base.getDay() === 6) {
        base.setDate(base.getDate() + 1);
      }
      break;
    case "none":
      return from ?? toLocalISODate(base);
  }

  return toLocalISODate(base);
}
