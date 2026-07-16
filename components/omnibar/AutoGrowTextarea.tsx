"use client";

import { useLayoutEffect, useRef } from "react";
import type { DateMatch } from "@/features/todos/smartParse";
import { HighlightedOverlay } from "./HighlightedOverlay";

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onEnter: () => void;
  dateMatch: DateMatch | null;
  listMatch?: DateMatch | null;
  tagMatches?: DateMatch[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Notifie le parent quand la saisie passe sur plusieurs lignes (ou inversement). */
  onMultilineChange?: (multiline: boolean) => void;
  /** Intercepteur clavier (autocomplétion) : appelé avant la logique interne. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const BASE_HEIGHT = 36;

/**
 * Champ de saisie « surligné » construit sur l'**approche miroir** :
 *
 * - un `<div>` miroir EN FLUX porte le texte stylé (dates, listes, note) et
 *   **dicte la taille** du champ — il s'adapte tout seul à son contenu ;
 * - un `<textarea>` transparent est superposé par-dessus (`absolute inset-0`)
 *   uniquement pour l'édition et le curseur.
 *
 * Comme c'est le miroir VISIBLE qui définit la hauteur, le texte ne peut jamais
 * déborder de la barre : les deux couches partagent des métriques de boîte
 * strictement identiques (padding, police, interligne, césure), donc elles
 * s'enroulent au même endroit. (La touche Entrée valide → la valeur ne contient
 * jamais de saut de ligne, seulement de l'enroulement.)
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onEnter,
  dateMatch,
  listMatch,
  tagMatches,
  placeholder,
  autoFocus,
  onMultilineChange,
  onKeyDown,
}: AutoGrowTextareaProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wasMultiline = useRef(false);

  // Détecte le passage multi-ligne d'après la hauteur réelle du miroir.
  useLayoutEffect(() => {
    const el = mirrorRef.current;
    if (!el) return;
    const multiline = el.offsetHeight > BASE_HEIGHT + 12;
    if (multiline !== wasMultiline.current) {
      wasMultiline.current = multiline;
      onMultilineChange?.(multiline);
    }
  }, [value, onMultilineChange]);

  // Métriques de boîte IDENTIQUES entre le miroir et le textarea.
  const sharedBox: React.CSSProperties = {
    minHeight: `${BASE_HEIGHT}px`,
    padding: "6px 8px 6px 16px", // ≡ pl-4 pr-2 + 6px haut/bas
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    boxSizing: "border-box",
  };

  const textClasses = "font-sans font-normal text-base leading-normal";

  return (
    <div className="relative w-full max-sm:min-w-[280px] min-w-[300px]">
      {/* Miroir visible : dicte la taille et l'enroulement. */}
      <div ref={mirrorRef} aria-hidden className={textClasses} style={sharedBox}>
        <HighlightedOverlay
          text={value}
          dateMatch={dateMatch}
          listMatch={listMatch}
          tagMatches={tagMatches}
        />
      </div>

      {/* Textarea transparent superposé : édition + curseur. */}
      <textarea
        name="task"
        value={value}
        rows={1}
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`absolute inset-0 resize-none overflow-hidden border-none bg-transparent text-transparent outline-none placeholder:text-muted-foreground ${textClasses}`}
        style={{ ...sharedBox, caretColor: "var(--color-foreground)" }}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          onKeyDown?.(e); // autocomplétion / commandes (peut preventDefault)
          if (e.defaultPrevented) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </div>
  );
}
