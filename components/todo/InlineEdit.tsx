"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  /** Titre : Entrée enregistre. Note : Entrée = retour à la ligne (défaut false). */
  submitOnEnter?: boolean;
  placeholder?: string;
  className?: string;
}

/** Champ d'édition inline auto-dimensionné (textarea), focus en fin de texte. */
export function InlineEdit({
  value,
  onSave,
  onCancel,
  submitOnEnter = false,
  placeholder,
  className,
}: InlineEditProps) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus + curseur en fin de texte au montage.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Auto-dimensionnement.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && submitOnEnter && !e.shiftKey) {
          e.preventDefault();
          onSave(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={className}
    />
  );
}
