"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface SidebarSlotContextValue {
  /** Une page fournit actuellement du contenu latéral. */
  hasContent: boolean;
  /** Élément DOM (rendu par le shell) qui loge ce contenu. */
  container: HTMLElement | null;
  setContainer: (el: HTMLElement | null) => void;
  announce: (delta: 1 | -1) => void;
}

const SidebarSlotContext = createContext<SidebarSlotContextValue | null>(null);

/**
 * Slot de contenu latéral : le « meuble » de navigation (sidebar ou colonne du
 * mode dock) prête son corps à la page courante. La page injecte son rail via
 * `<SidebarSlot>` ; le shell décide seulement OÙ ce contenu vit et bascule sa
 * propre nav en rangée d'icônes compacte tant qu'un contenu est présent.
 */
export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  // Compteur (pas un booléen) : pendant la bascule squelette → contenu réel,
  // deux slots coexistent le temps d'un commit — le total batché ne repasse
  // jamais par zéro, le meuble ne « clignote » pas.
  const [count, setCount] = useState(0);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const announce = useCallback(
    (delta: 1 | -1) => setCount((c) => c + delta),
    [],
  );
  const value = useMemo(
    () => ({ hasContent: count > 0, container, setContainer, announce }),
    [count, container, announce],
  );
  return (
    <SidebarSlotContext.Provider value={value}>
      {children}
    </SidebarSlotContext.Provider>
  );
}

export function useSidebarSlot(): SidebarSlotContextValue {
  const ctx = useContext(SidebarSlotContext);
  if (!ctx)
    throw new Error("useSidebarSlot doit être utilisé sous SidebarSlotProvider.");
  return ctx;
}

/**
 * Contenu latéral d'une page, téléporté dans le meuble du shell. Portal React :
 * l'état, les props et les contextes (sélection, filtres, DnD) restent ceux de
 * la page — rien ne remonte dans le shell, les autres pages ne chargent rien.
 */
export function SidebarSlot({ children }: { children: ReactNode }) {
  const { container, announce } = useSidebarSlot();
  // useLayoutEffect : le shell doit réserver la colonne AVANT le premier
  // paint, sinon le dock flottant apparaît un instant puis saute.
  useLayoutEffect(() => {
    announce(1);
    return () => announce(-1);
  }, [announce]);
  return container ? createPortal(children, container) : null;
}
