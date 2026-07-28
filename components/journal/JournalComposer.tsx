"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface JournalComposerProps {
  /** Cible d'écriture affichée dans le placeholder (jour visité, pas forcément aujourd'hui). */
  placeholder: string;
  onSubmit: (content: string) => void | Promise<void>;
}

/**
 * Ajoute un bloc à la page-jour affichée. Un seul champ, sans les contrôles
 * de l'Omnibar (date/priorité/liste — ceux-là n'ont pas de sens pour du texte
 * libre) : Entrée envoie, Maj+Entrée passe à la ligne.
 */
export function JournalComposer({ placeholder, onSubmit }: JournalComposerProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const text = value.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(text);
      setValue("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] px-4 py-3 dark:bg-foreground/[0.04]">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        disabled={submitting}
        className="min-h-[2.25rem] resize-none rounded-none border-none bg-transparent px-0 py-0 text-[0.95rem] leading-7 text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  );
}
