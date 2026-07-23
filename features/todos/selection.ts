// Sélection multiple — logique pure (sans React ni DOM), testable isolément.
// Version « lean » (voir docs/ROADMAP-THINGS.md, K1c) : sélection par clic
// modifié (Ctrl/Cmd = bascule, Maj = plage), pas de lasso ni d'aperçu au drag.

/** Bascule l'appartenance d'un id (renvoie un nouvel ensemble). */
export function toggleId(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Plage contiguë (inclusive) entre deux ids dans l'ordre affiché. L'ancre ou la
 * cible absente (liste re-rendue entre-temps) → au moins la cible seule.
 */
export function rangeIds(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a === -1 || b === -1) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(lo, hi + 1);
}

export type ClickMods = { shift: boolean; meta: boolean };

export interface SelectionResult {
  selected: Set<string>;
  anchor: string | null;
  /** Le clic était un geste de SÉLECTION → l'appelant n'ouvre PAS le détail. */
  consumed: boolean;
}

/**
 * État de sélection après un clic sur `id`.
 * - **Maj** : sélectionne la plage ancre→cible (remplace la sélection).
 * - **Ctrl/Cmd** : bascule l'id ; il devient la nouvelle ancre.
 * - **clic simple** : ne consomme pas (l'appelant ouvre le détail) mais VIDE
 *   une sélection en cours — un clic normal fait toujours la chose évidente et
 *   congédie la sélection au passage.
 */
export function selectionOnClick(
  prev: ReadonlySet<string>,
  anchor: string | null,
  orderedIds: readonly string[],
  id: string,
  mods: ClickMods,
): SelectionResult {
  if (mods.shift && anchor) {
    return { selected: new Set(rangeIds(orderedIds, anchor, id)), anchor, consumed: true };
  }
  if (mods.meta) {
    return { selected: toggleId(prev, id), anchor: id, consumed: true };
  }
  return {
    selected: prev.size > 0 ? new Set() : new Set(prev),
    anchor: id,
    consumed: false,
  };
}
