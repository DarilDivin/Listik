"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import Omnibar from "@/components/Omnibar";
import { useShortcut } from "@/lib/keys";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

export interface CaptureRowHandle {
  /** Donne le focus au champ (raccourci Ctrl+N). */
  open: () => void;
}

interface CaptureRowProps {
  onSubmit: (taskData: SmartTaskData) => Promise<void>;
  onSubmitNote?: (text: string) => void | Promise<void>;
  lists?: string[];
  placeholder?: string;
}

/**
 * Capture posée en tête de liste. UN SEUL élément, toujours monté : l'Omnibar
 * en variante « inline ». Au repos elle a le gabarit d'une rangée de tâche —
 * cercle fantôme, invite estompée, fond de page — et au focus elle ouvre son
 * enveloppe (hairline, coins plus ronds) puis déplie ses contrôles. Rien n'est
 * démonté ni remplacé : c'est littéralement la même boîte qui s'ouvre, seule
 * façon que la transition ne trahisse pas deux éléments différents.
 *
 * Le padding est constant entre les deux états : le texte ne bouge pas d'un
 * pixel quand on clique.
 */
export const CaptureRow = forwardRef<CaptureRowHandle, CaptureRowProps>(
  function CaptureRow({ onSubmit, onSubmitNote, lists, placeholder }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const shortcut = useShortcut("N");

    useImperativeHandle(ref, () => ({
      open: () =>
        rootRef.current
          ?.querySelector<HTMLElement>('[contenteditable="true"], textarea')
          ?.focus(),
    }), []);

    return (
      <div ref={rootRef} className="group">
        <Omnibar
          variant="inline"
          defaultMode="task"
          onSubmit={onSubmit}
          onSubmitNote={onSubmitNote}
          placeholder={placeholder}
          lists={lists}
          // Aligné sur la première ligne du champ (24px) comme la case à
          // cocher l'est sur le titre d'une tâche ; le pointillé dit
          // « pas encore une tâche ».
          leading={
            <span
              aria-hidden
              className="mt-[3px] size-[18px] shrink-0 rounded-full border-2 border-dashed border-muted-foreground/30 transition-colors group-hover:border-muted-foreground/50 group-focus-within:border-brand/40"
            />
          }
          // Indice typographique, pas pastille : même teinte que l'invite,
          // simplement en chasse fixe pour dire « c'est une touche ». Un `Kbd`
          // (fond plein, hauteur propre) était l'élément le plus lourd d'une
          // rangée qui se veut plate. La notation suit la plateforme (voir
          // `lib/keys`) : « ⌘N » sur Mac, « Ctrl N » ailleurs.
          hint={
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {shortcut}
            </span>
          }
        />
      </div>
    );
  },
);
