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
  /** Gabarit resserré : la barre vit dans une liste (variante « inline » de
   *  l'Omnibar) et doit avoir la hauteur d'une rangée, pas d'une console. */
  compact?: boolean;
  /** Invite estompée : la rangée est au repos, elle ne réclame pas l'œil. */
  dimmed?: boolean;
  /** Notifie le parent quand la saisie passe sur plusieurs lignes (ou inversement). */
  onMultilineChange?: (multiline: boolean) => void;
  /** Intercepteur clavier (autocomplétion) : appelé avant la logique interne. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Champ de conversation : sans surlignage métier, à largeur fluide, avec
   * un retour à la ligne volontaire et une hauteur bornée.
   */
  variant?: "default" | "conversation";
  /** Incrémentez cette valeur pour replacer le curseur dans le champ. */
  focusSignal?: number;
}

/** Hauteur d'une ligne de texte (16px, interligne normal). */
const LINE_HEIGHT = 24;

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
  compact = false,
  dimmed = false,
  onMultilineChange,
  onKeyDown,
  variant = "default",
  focusSignal,
}: AutoGrowTextareaProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLTextAreaElement>(null);
  const wasMultiline = useRef(false);
  const isConversation = variant === "conversation";

  // En gabarit resserré, la boîte se règle sur la ligne de texte elle-même :
  // le champ fait exactement la hauteur d'une rangée de tâche, et son bord
  // gauche tombe sur le titre (l'indentation vient du gabarit de la rangée,
  // pas d'un padding interne).
  const padY = compact ? 0 : 6;
  const oneLine = padY * 2 + LINE_HEIGHT;

  // Détecte le passage multi-ligne d'après la hauteur réelle du miroir.
  useLayoutEffect(() => {
    if (isConversation) {
      const el = conversationRef.current;
      if (!el) return;
      el.style.height = "0px";
      const height = Math.min(el.scrollHeight, 144);
      el.style.height = `${Math.max(LINE_HEIGHT, height)}px`;
      const multiline = height > LINE_HEIGHT + 2;
      if (multiline !== wasMultiline.current) {
        wasMultiline.current = multiline;
        onMultilineChange?.(multiline);
      }
      return;
    }

    const el = mirrorRef.current;
    if (!el) return;
    const multiline = el.offsetHeight > oneLine + 12;
    if (multiline !== wasMultiline.current) {
      wasMultiline.current = multiline;
      onMultilineChange?.(multiline);
    }
  }, [value, oneLine, onMultilineChange, isConversation]);

  useLayoutEffect(() => {
    if (focusSignal === undefined) return;
    conversationRef.current?.focus();
  }, [focusSignal]);

  // Métriques de boîte IDENTIQUES entre le miroir et le textarea.
  const sharedBox: React.CSSProperties = {
    minHeight: `${oneLine}px`,
    padding: compact ? `0 8px 0 0` : "6px 8px 6px 16px", // ≡ pl-4 pr-2 + 6px haut/bas
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    boxSizing: "border-box",
  };

  const textClasses = "font-sans font-normal text-base leading-normal";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (
      e.key === "Enter" &&
      (!isConversation || (!e.shiftKey && !e.nativeEvent.isComposing))
    ) {
      e.preventDefault();
      onEnter();
    }
  };

  if (isConversation) {
    return (
      <textarea
        ref={conversationRef}
        name="assistant-message"
        aria-label="Message à l’Assistant"
        value={value}
        rows={1}
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`block w-full min-w-0 resize-none overflow-y-auto border-none bg-transparent py-1 outline-none placeholder:transition-colors ${
          dimmed ? "placeholder:text-muted-foreground/50" : "placeholder:text-muted-foreground"
        } ${textClasses}`}
        style={{ minHeight: `${LINE_HEIGHT}px`, maxHeight: "144px" }}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      className={
        compact
          ? "relative w-full"
          : "relative w-full max-sm:min-w-[280px] min-w-[300px]"
      }
    >
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
        className={`absolute inset-0 resize-none overflow-hidden border-none bg-transparent text-transparent outline-none placeholder:transition-colors ${
          dimmed
            ? "placeholder:text-muted-foreground/50"
            : "placeholder:text-muted-foreground"
        } ${textClasses}`}
        style={{ ...sharedBox, caretColor: "var(--color-foreground)" }}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
