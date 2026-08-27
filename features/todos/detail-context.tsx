"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Ouvre le panneau de détail d'une tâche depuis n'importe quelle ligne, alors
 * que le panneau, lui, n'est rendu qu'UNE fois, par la page.
 *
 * Ce n'est pas qu'une économie de props (même motif que `duplicate-context`,
 * mêmes six composants à traverser) : c'est ce qui garde le panneau OUVERT.
 * Tant que l'état vivait dans `TodoItem`, modifier un champ qui change le
 * regroupement refermait le panneau au milieu de l'édition — passer
 * « Répéter » à autre chose que « Jamais » range la tâche dans Routines
 * (`grouping.ts`), chaque section est un sous-arbre distinct, la ligne était
 * donc démontée et le panneau partait avec elle. La page, elle, ne bouge pas :
 * elle retrouve la tâche par son id, quelle que soit la section qui l'affiche
 * à cet instant.
 *
 * Hors fournisseur, une ligne n'ouvre rien.
 */
const OpenTodoDetailContext = createContext<((id: string) => void) | null>(null);

export function TodoDetailProvider({
  onOpen,
  children,
}: {
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <OpenTodoDetailContext.Provider value={onOpen}>
      {children}
    </OpenTodoDetailContext.Provider>
  );
}

/** `null` si aucun fournisseur : la ligne n'ouvre pas de panneau. */
export function useOpenTodoDetail() {
  return useContext(OpenTodoDetailContext);
}
