/**
 * La taille d'un fichier, dite comme on la lit.
 *
 * `null` rend une chaîne VIDE, et c'est le point : les pièces attachées avant
 * que la colonne existe n'ont pas de taille, et « 0 o » serait une information
 * fausse affichée à l'écran. On en dit moins plutôt que de mentir — la même
 * règle que pour un fichier disparu.
 *
 * `bigint` parce que c'est ce que ts-rs rend d'un `i64` ; l'IPC livre un
 * nombre, d'où le `Number()` (même idiome que `JournalDensity`).
 */
export function poids(octets: bigint | number | null): string {
  if (octets === null || octets === undefined) return "";
  const n = Number(octets);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} o`;
  const ko = n / 1024;
  // Sous le méga-octet, la décimale n'apprend rien : « 84 Ko » suffit.
  if (ko < 1024) return `${Math.round(ko)} Ko`;
  return `${(ko / 1024).toFixed(1).replace(".", ",")} Mo`;
}
