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
  placeholder?: string;
  autoFocus?: boolean;
  /** Notifie le parent quand la saisie passe sur plusieurs lignes (ou inversement). */
  onMultilineChange?: (multiline: boolean) => void;
  /** Intercepteur clavier (autocomplétion) : appelé avant la logique interne. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const BASE_HEIGHT = 36;

/**
 * Textarea « caché » (texte transparent, seul le curseur est visible) doublé
 * d'un calque qui affiche le texte stylé, parfaitement superposés.
 *
 * La hauteur est pilotée UNIQUEMENT impérativement (refs) : on ne met pas de
 * `height` dans le `style` React, sinon React la réapplique à chaque rendu et
 * écrase la mesure. `minHeight` garantit la hauteur de base avant le 1er calcul.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onEnter,
  dateMatch,
  listMatch,
  placeholder,
  autoFocus,
  onMultilineChange,
  onKeyDown,
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const wasMultiline = useRef(false);

  const resize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = `${BASE_HEIGHT}px`;
    const scrollHeight = textarea.scrollHeight;
    const height = `${Math.max(scrollHeight, BASE_HEIGHT)}px`;
    textarea.style.height = height;
    if (overlayRef.current) overlayRef.current.style.height = height;

    const multiline = scrollHeight > BASE_HEIGHT + 12;
    if (multiline !== wasMultiline.current) {
      wasMultiline.current = multiline;
      onMultilineChange?.(multiline);
    }
  };

  // Recalcule à chaque changement de valeur (saisie, insertion de date, reset).
  useLayoutEffect(resize, [value]);

  const sharedBox: React.CSSProperties = {
    minHeight: `${BASE_HEIGHT}px`,
    paddingTop: "6px",
    paddingBottom: "6px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div className="relative w-full flex-1 flex flex-col justify-center">
      <textarea
        ref={textareaRef}
        name="task"
        value={value}
        rows={1}
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full block max-sm:min-w-[280px] min-w-[300px] pl-4 pr-2 outline-none font-sans font-normal text-transparent placeholder:text-muted-foreground text-base border-none resize-none bg-transparent overflow-hidden leading-normal"
        style={{ ...sharedBox, height: `${BASE_HEIGHT}px`, caretColor: "var(--color-foreground)" }}
        onChange={(e) => onChange(e.target.value)}
        onInput={resize}
        onFocus={onFocus}
        onKeyDown={(e) => {
          onKeyDown?.(e); // autocomplétion (peut preventDefault)
          if (e.defaultPrevented) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <div
        ref={overlayRef}
        className="text-overlay w-full max-sm:min-w-[280px] min-w-[300px] absolute top-0 left-0 pl-4 pr-2 pointer-events-none z-0 font-sans font-normal text-base leading-normal"
        style={{ ...sharedBox, height: `${BASE_HEIGHT}px`, clipPath: "inset(-20px -15px -20px -20px)" }}
        aria-hidden
      >
        <HighlightedOverlay text={value} dateMatch={dateMatch} listMatch={listMatch} />
      </div>
    </div>
  );
}
