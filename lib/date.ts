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

/**
 * Compte à rebours d'échéance, façon Things : « J-3 » (à venir), « J-0 »
 * (aujourd'hui), « J+2 » (dépassée). `reached` pilote la couleur (destructive
 * dès que l'échéance est atteinte — pas de palier intermédiaire, la palette
 * n'autorise pas d'orange).
 *
 * Les deux dates sont des « jour seul » YYYY-MM-DD : on les parse en UTC
 * (comportement natif de `Date.parse` sur ce format) pour un écart en jours
 * exact, insensible aux fuseaux et aux heures d'été.
 */
export function deadlineCountdown(
  dueDate: string,
  today: string,
): { label: string; reached: boolean } {
  const days = Math.round(
    (Date.parse(dueDate) - Date.parse(today)) / 86_400_000,
  );
  const label = days >= 0 ? `J-${days}` : `J+${-days}`;
  return { label, reached: days <= 0 };
}
