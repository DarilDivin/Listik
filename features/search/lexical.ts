// Correspondance lexicale locale (Quick Find) — logique pure, testable
// isolément. Complète la recherche sémantique (via le sidecar IA, tâches et
// notes seulement) pour les projets/domaines/tags, que la base vectorielle
// n'indexe pas — étendre le sidecar Python serait un chantier à part, hors
// périmètre de cette phase.

/**
 * Normalise pour une comparaison insensible à la CASSE et aux DIACRITIQUES :
 * « Épicerie » doit matcher « epic ». La casse seule (NOCASE) ne suffit pas
 * pour une app en français — c'est la différence entre une recherche qui
 * marche et une qui semble cassée à la moindre lettre accentuée.
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filtre et classe des éléments {id,name} par sous-chaîne (insensible casse +
 * diacritiques) : correspondance en tête de nom d'abord, puis position la
 * plus précoce, puis nom le plus court. Suffisant à l'échelle personnelle
 * (quelques dizaines de projets/tags) — une correspondance floue coûterait
 * plus qu'elle n'apporterait ici.
 */
export function lexicalMatch<T extends { id: string; name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = normalize(query.trim());
  if (!q) return [];
  return items
    .map((item) => ({ item, index: normalize(item.name).indexOf(q) }))
    .filter((x) => x.index !== -1)
    .sort((a, b) => {
      const prefixA = a.index === 0 ? 0 : 1;
      const prefixB = b.index === 0 ? 0 : 1;
      return prefixA - prefixB || a.index - b.index || a.item.name.length - b.item.name.length;
    })
    .map((x) => x.item);
}
