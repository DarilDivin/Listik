"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Permet à `TodoItem`, au fond de la liste, de proposer « Dupliquer » dans
 * son menu contextuel — sans faire traverser un rappel à six composants qui
 * n'en ont aucun usage (page → SectionBody → style de section →
 * AnimatedTodoList → TodoItem). Même parti pris que `tag-filter.tsx` : tous
 * les styles de section (Liste, Horizon, Zoom, Loupe…) rendent `TodoItem`
 * directement, il aurait fallu toucher chacun d'eux pour une seule prop.
 *
 * Hors fournisseur, l'entrée « Dupliquer » ne s'affiche pas.
 */
const DuplicateTodoContext = createContext<((id: string) => void) | null>(null);

export function DuplicateTodoProvider({
  onDuplicate,
  children,
}: {
  onDuplicate: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <DuplicateTodoContext.Provider value={onDuplicate}>
      {children}
    </DuplicateTodoContext.Provider>
  );
}

/** `null` si aucun fournisseur : pas d'entrée « Dupliquer » dans le menu. */
export function useDuplicateTodo() {
  return useContext(DuplicateTodoContext);
}
