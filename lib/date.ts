/**
 * Date « jour seul » en heure LOCALE au format YYYY-MM-DD.
 * Évite le bug classique de `toISOString().split('T')[0]` qui renvoie
 * la date en UTC et peut décaler d'un jour près de minuit.
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** La date locale d'aujourd'hui au format YYYY-MM-DD. */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}
