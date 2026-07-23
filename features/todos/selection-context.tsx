"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { selectionOnClick } from "./selection";

export interface SelectionApi {
  selectedIds: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  /**
   * Traite un clic sur une ligne. Renvoie `true` si c'était un geste de
   * sélection (Ctrl/Cmd ou Maj) → l'appelant N'OUVRE PAS le détail.
   */
  handleClick: (
    id: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => boolean;
  clear: () => void;
}

/**
 * État de sélection multiple, possédé par la PAGE (qui en dérive la barre
 * d'actions par lot) puis distribué aux lignes via le contexte.
 *
 * `orderedIds` = ordre affiché courant (nécessaire à la sélection par plage) ;
 * gardé dans une ref pour ne pas recréer `handleClick` à chaque rendu.
 */
export function useSelectionController(orderedIds: string[]): SelectionApi {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const orderedRef = useRef(orderedIds);
  orderedRef.current = orderedIds;

  const handleClick = useCallback<SelectionApi["handleClick"]>(
    (id, e) => {
      let consumed = false;
      setSelected((prev) => {
        const r = selectionOnClick(prev, anchorRef.current, orderedRef.current, id, {
          shift: e.shiftKey,
          meta: e.metaKey || e.ctrlKey,
        });
        anchorRef.current = r.anchor;
        setAnchor(r.anchor);
        consumed = r.consumed;
        return r.consumed || prev.size > 0 ? r.selected : prev;
      });
      return consumed;
    },
    [],
  );

  // Ancre lue dans le setter fonctionnel : ref pour éviter une dépendance qui
  // recréerait `handleClick` (et détacherait les lignes) à chaque sélection.
  const anchorRef = useRef<string | null>(anchor);
  anchorRef.current = anchor;

  const clear = useCallback(() => {
    anchorRef.current = null;
    setAnchor(null);
    setSelected(new Set());
  }, []);

  return useMemo<SelectionApi>(
    () => ({
      selectedIds: selected,
      isSelected: (id) => selected.has(id),
      handleClick,
      clear,
    }),
    [selected, handleClick, clear],
  );
}

const SelectionContext = createContext<SelectionApi | null>(null);

/** Distribue la sélection aux lignes. Hors fournisseur, rien n'est sélectionnable. */
export function SelectionProvider({
  value,
  children,
}: {
  value: SelectionApi;
  children: React.ReactNode;
}) {
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** `null` hors fournisseur : la ligne n'est alors pas sélectionnable. */
export function useSelection() {
  return useContext(SelectionContext);
}
