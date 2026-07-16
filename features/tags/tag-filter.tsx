"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Permet à une pastille de tag, au fond de la liste, de filtrer la vue —
 * le geste « cliquer un tag pour filtrer » de Things.
 *
 * Un contexte plutôt qu'une prop : le rappel devrait sinon traverser six
 * composants (page → SectionBody → style de section → AnimatedTodoList →
 * TodoItem → TodoMetaLine) qui n'en ont aucun usage. `TodoMetaLine` va déjà
 * chercher ses données elle-même (projets) : même parti pris.
 *
 * Hors fournisseur, les pastilles restent de simples étiquettes.
 */
const TagFilterContext = createContext<((tagId: string) => void) | null>(null);

export function TagFilterProvider({
  onFilterTag,
  children,
}: {
  onFilterTag: (tagId: string) => void;
  children: ReactNode;
}) {
  return (
    <TagFilterContext.Provider value={onFilterTag}>
      {children}
    </TagFilterContext.Provider>
  );
}

/** `null` si aucun fournisseur : les pastilles ne sont alors pas cliquables. */
export function useTagFilter() {
  return useContext(TagFilterContext);
}
