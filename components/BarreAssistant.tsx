"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AiBrain01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/omnibar/AutoGrowTextarea";

interface BarreAssistantProps {
  /** Envoi d'une question. */
  onSubmit: (text: string) => void | Promise<void>;
  /**
   * Une question est en vol : le bouton d'envoi tourne et l'Entrée n'envoie
   * plus. Sans cela, la deuxième question serait avalée — la barre viderait
   * son champ pendant que la page refuse l'appel.
   */
  busy?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Icône de tête. Par défaut, la pastille Question (non cliquable). */
  leading?: React.ReactNode;
  /** Permet à la fenêtre rapide de conserver son routage par mot-clé tout en
   * utilisant exactement la même barre que l'Assistant. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Signal ponctuel utilisé quand une suggestion vient de préremplir la barre. */
  focusSignal?: number;
  /** Dans la fenêtre rapide, le shell parent porte déjà la surface et le mouvement. */
  variant?: "floating" | "inline";
}

/**
 * La barre de conversation, seule — issue du découpage de l'ancien Omnibar à
 * modes (voir docs/ROADMAP-BARRES.md, étape 2). Aucune notion de mode ici :
 * envoyer, attendre, recommencer. Utilisée par l'Assistant et, à terme, par
 * la fenêtre rapide.
 *
 * Écart assumé vis-à-vis de l'ancien Omnibar : `/tâche` et `/note` ont
 * disparu de cette barre. L'agent sait déjà créer une tâche ou une note en
 * langage naturel (function-calling MCP, D4) — le raccourci slash ne servait
 * qu'à contourner l'agent, pas une capacité que cette barre perdrait.
 */
export default function BarreAssistant({
  onSubmit,
  busy = false,
  placeholder,
  autoFocus,
  leading,
  value: controlledValue,
  onValueChange,
  focusSignal,
  variant = "floating",
}: BarreAssistantProps) {
  const [internalValue, setInternalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const value = controlledValue ?? internalValue;
  const setValue = onValueChange ?? setInternalValue;
  const inline = variant === "inline";

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    try {
      await onSubmit(text);
      setValue(""); // on reste dans la conversation pour enchaîner les questions
    } catch {
      // l'erreur (toast) est gérée côté handler
    }
  };

  // Ferme l'enveloppe seulement si le focus quitte réellement le formulaire —
  // pas le cas d'un clic sur le bouton d'envoi, qui blur transitoirement le
  // champ avant que son propre onClick ne s'exécute.
  const handleFormBlur = () => {
    setTimeout(() => {
      if (!formRef.current) return;
      if (!formRef.current.contains(document.activeElement)) {
        setIsFocused(false);
      }
    }, 150);
  };

  return (
    <motion.form
      ref={formRef}
      className={cn(
        "relative flex w-full items-stretch gap-2 text-left",
        inline
          ? "h-full px-3 py-2"
          : cn(
              "max-w-4xl rounded-2xl border border-transparent p-2",
              "transition-[background-color,border-color,box-shadow] duration-500 ease-out",
              isFocused
                ? "border-border/60 bg-popover shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_32px_-12px_rgba(0,0,0,0.55)]"
                : "bg-foreground/[0.035] shadow-none dark:bg-foreground/[0.05]",
            ),
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      layout={!inline}
      transition={{ type: "spring", bounce: 0.25, duration: 0.55 }}
      style={{ height: inline ? "100%" : "auto", width: inline || isFocused ? "100%" : "auto" }}
      onBlur={handleFormBlur}
    >
      {leading ?? (
        <span
          className={cn(
            "grid shrink-0 place-items-center text-brand",
            inline
              ? "size-6 self-center rounded-md"
              : "size-9 self-start rounded-xl bg-brand-soft",
          )}
          aria-label="Question"
          title="Question"
        >
          <AppIcon icon={AiBrain01Icon} size={inline ? 16 : 18} />
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:flex-wrap">
        <AutoGrowTextarea
          value={value}
          onChange={setValue}
          onFocus={() => setIsFocused(true)}
          onEnter={() => void submit()}
          dateMatch={null}
          listMatch={null}
          tagMatches={undefined}
          placeholder={placeholder ?? "Demander, créer, chercher… en langage naturel"}
          autoFocus={autoFocus}
          variant="conversation"
          focusSignal={focusSignal}
        />
      </div>

      {/* Envoi : sur une surface qui se lit comme une conversation, l'Entrée
          seule est invisible — le template shadcn met là une flèche, on fait
          pareil. TOUJOURS monté (désactivé à vide) et jamais révélé :
          monté/démonté, il ferait sauter la largeur de la colonne de texte à
          la première frappe. */}
      <Button
        type="submit"
        size="icon-sm"
        disabled={busy || !value.trim()}
        aria-label="Envoyer"
        className="size-9 shrink-0 self-end rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {busy ? <Spinner /> : <AppIcon icon={ArrowUp01Icon} size={18} strokeWidth={2} />}
      </Button>
    </motion.form>
  );
}
