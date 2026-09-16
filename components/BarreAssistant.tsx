"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp, Sparkles } from "lucide-react";
import { motion } from "motion/react";
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
}: BarreAssistantProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
        "relative flex w-full max-w-4xl items-stretch gap-2 rounded-2xl p-2 text-left",
        "transition-[background-color,border-color,box-shadow] duration-500 ease-out",
        isFocused
          ? "border border-border/60 bg-popover shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_32px_-12px_rgba(0,0,0,0.55)]"
          : "border border-transparent bg-foreground/[0.035] shadow-none dark:bg-foreground/[0.05]",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      layout
      transition={{ type: "spring", bounce: 0.25, duration: 0.55 }}
      style={{ height: "auto", width: isFocused ? "100%" : "auto" }}
      onBlur={handleFormBlur}
    >
      <span
        className="grid size-9 shrink-0 self-start place-items-center rounded-xl bg-violet-500/8 text-violet-600 dark:text-violet-400"
        aria-label="Question"
        title="Question"
      >
        <Sparkles className="size-[18px]" />
      </span>

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
        {busy ? <Spinner /> : <ArrowUp />}
      </Button>
    </motion.form>
  );
}
