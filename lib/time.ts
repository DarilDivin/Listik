/** Formate des heures/minutes en « HH:MM » (zéro-paddé). */
export function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parse une saisie d'heure libre en « HH:MM », ou `null` si invalide.
 *
 * Accepte par ex. : « 9 », « 09 », « 930 », « 9:30 », « 9.30 », « 9 30 »,
 * « 9h », « 9h30 », « 1815 », « 9pm », « 12 am », « 9:30 pm ».
 */
export function parseTime(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;

  // Méridien optionnel (am/pm), éventuellement collé aux chiffres.
  let meridiem: "am" | "pm" | null = null;
  const mer = s.match(/\s*(am|pm)$/);
  if (mer) {
    meridiem = mer[1] as "am" | "pm";
    s = s.slice(0, mer.index).trim();
  }

  let hours: number | null = null;
  let minutes = 0;

  // Séparateur explicite : « : », « . », « h » ou espace.
  const sep =
    s.match(/^(\d{1,2})\s*[:.h]\s*(\d{0,2})$/) ||
    s.match(/^(\d{1,2})\s+(\d{1,2})$/);

  if (sep) {
    hours = Number(sep[1]);
    minutes = sep[2] === "" ? 0 : Number(sep[2]);
  } else if (/^\d+$/.test(s)) {
    // Suite de chiffres compacte : « 9 » → 9h, « 930 » → 9h30, « 1815 » → 18h15.
    if (s.length <= 2) {
      hours = Number(s);
    } else if (s.length === 3) {
      hours = Number(s.slice(0, 1));
      minutes = Number(s.slice(1));
    } else if (s.length === 4) {
      hours = Number(s.slice(0, 2));
      minutes = Number(s.slice(2));
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (hours === null || Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  if (hours > 23 || minutes > 59) return null;
  return formatTime(hours, minutes);
}
