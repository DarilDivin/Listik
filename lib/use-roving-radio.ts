import { useRef, type KeyboardEvent, type RefCallback } from "react";

/**
 * Sémantique ARIA d'un groupe radio horizontal (choisir-un-parmi-N), avec
 * tabindex flottant : seul l'item actif est dans l'ordre de tabulation, les
 * flèches déplacent focus ET sélection ensemble (« select follows focus »,
 * le comportement attendu d'un radiogroup natif). Remplace `aria-pressed`
 * par bouton — correct pour un toggle indépendant, imprécis pour un choix
 * mutuellement exclusif (un lecteur d'écran n'annonce alors ni le groupe ni
 * la position dans le groupe).
 */
export function useRovingRadioGroup<T extends string>(
  values: readonly T[],
  active: T,
  onSelect: (value: T) => void,
) {
  const refs = useRef<Array<HTMLElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = values.indexOf(active);
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % values.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + values.length) % values.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = values.length - 1;
    else return;

    e.preventDefault();
    onSelect(values[next]);
    refs.current[next]?.focus();
  };

  const getItemProps = (value: T, index: number) => ({
    ref: ((el) => {
      refs.current[index] = el;
    }) as RefCallback<HTMLElement>,
    role: "radio" as const,
    "aria-checked": value === active,
    tabIndex: value === active ? 0 : -1,
  });

  return { onKeyDown, getItemProps };
}
