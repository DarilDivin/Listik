"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface JournalComposerProps {
  /** Cible d'écriture affichée dans le placeholder (jour visité, pas forcément aujourd'hui). */
  placeholder: string;
  onSubmit: (content: string) => void | Promise<void>;
  /**
   * Habillage. « default » : bloc d'écriture posé en bas de la page Journal.
   * « inline » : rangée d'un fil (widget de l'accueil) — même idiome que la
   * capture de tâche, à plat au repos, enveloppe ouverte au focus.
   */
  variant?: "default" | "inline";
}

/**
 * Ajoute un bloc à la page-jour affichée. Un seul champ, sans les contrôles
 * de l'Omnibar (date/priorité/liste — ceux-là n'ont pas de sens pour du texte
 * libre) : Entrée envoie, Maj+Entrée passe à la ligne.
 *
 * En variante « inline », le champ reste TOUJOURS monté : son habillage seul
 * change au focus (cf. `CaptureRow`) — jamais un bouton remplacé par un
 * champ, qui se verrait pour ce qu'il est, deux éléments distincts.
 */
export function JournalComposer({
  placeholder,
  onSubmit,
  variant = "default",
}: JournalComposerProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const inline = variant === "inline";

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
    <div
      className={cn(
        inline
          ? cn(
              // Padding constant : seule l'enveloppe s'ouvre, le texte ne
              // bouge pas.
              "flex items-start gap-3 bg-transparent px-3 py-1.5",
              "transition-[background-color,border-color,border-radius] duration-300 ease-out",
              focused
                ? "rounded-2xl border border-border/60"
                : "cursor-text rounded-lg border border-transparent hover:bg-foreground/[0.045]",
            )
          : "rounded-2xl border border-border/60 bg-foreground/[0.02] px-4 py-3 dark:bg-foreground/[0.04]",
      )}
      onMouseDown={(e) => {
        if (!inline || focused) return;
        if ((e.target as HTMLElement).closest("textarea")) return;
        e.preventDefault();
        fieldRef.current?.focus();
      }}
    >
      {inline && (
        <Plus
          aria-hidden
          size={16}
          className={cn(
            "mt-1.5 shrink-0 transition-colors",
            focused ? "text-brand/60" : "text-muted-foreground/40",
          )}
        />
      )}
      <Textarea
        ref={fieldRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          } else if (inline && e.key === "Escape" && !value.trim()) {
            // Rendre le focus suffit : la rangée reprend son habillage au
            // repos. Jamais avec un brouillon en cours.
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        disabled={submitting}
        className={cn(
          "resize-none rounded-none border-none bg-transparent px-0 py-0 text-[0.95rem] leading-7 text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent",
          inline
            ? "min-h-7 placeholder:transition-colors"
            : "min-h-[2.25rem]",
          inline && !focused && "placeholder:text-muted-foreground/50",
        )}
      />
    </div>
  );
}
