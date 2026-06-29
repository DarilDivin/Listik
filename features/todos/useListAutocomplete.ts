import { useEffect, useState, type KeyboardEvent } from "react";

export interface ListSuggestion {
  type: "list" | "create";
  value: string;
}

// Tag de liste en cours de saisie, en fin de texte : `#partiel`.
const ACTIVE_TAG = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u;

/**
 * Autocomplétion du tag `#liste` pendant la frappe : propose les listes
 * existantes correspondantes (insensible à la casse) + une option « Créer ».
 * Évite de dupliquer une liste à cause de la casse ou d'une faute de frappe.
 */
export function useListAutocomplete(
  task: string,
  setTask: (value: string) => void,
  lists: string[],
) {
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Tag actif uniquement hors note (avant `//`).
  const noteIdx = task.indexOf("//");
  const m = ACTIVE_TAG.exec(task);
  const query = m && (noteIdx === -1 || m.index < noteIdx) ? m[1] : null;

  const lower = (query ?? "").toLowerCase();
  const matches = query === null ? [] : lists.filter((l) => l.toLowerCase().includes(lower));
  const exact = query !== null && lists.some((l) => l.toLowerCase() === lower);

  const items: ListSuggestion[] =
    query === null
      ? []
      : [
          ...matches.map((value) => ({ type: "list" as const, value })),
          ...(query.length > 0 && !exact
            ? [{ type: "create" as const, value: query }]
            : []),
        ];

  const open = query !== null && items.length > 0 && dismissed !== query;

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const accept = (item: ListSuggestion) => {
    if (query === null) return;
    const start = task.length - query.length - 1; // position du '#'
    setTask(task.slice(0, start) + `#${item.value} `);
    setDismissed(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(items[Math.min(highlight, items.length - 1)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(query);
    }
  };

  const dismiss = () => {
    if (query !== null) setDismissed(query);
  };

  return { open, items, highlight, setHighlight, accept, onKeyDown, dismiss };
}
