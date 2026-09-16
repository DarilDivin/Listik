"use client";

import { AutoGrowTextarea } from "@/components/omnibar/AutoGrowTextarea";

interface QuickNeutralProps {
  value: string;
  onChange: (value: string) => void;
  /** Entrée sur un texte non vide : part vers l'Assistant. */
  onSubmit: () => void;
  autoFocus?: boolean;
}

/**
 * La barre neutre de la fenêtre rapide — rien n'est encore choisi, elle est
 * ouverte à tout (voir l'artifact « La fenêtre rapide »). Pas une des trois
 * vraies barres : juste un champ, gardé ici plutôt que dans
 * `app/quick/page.tsx` pour que la détection du mot qui se solidifie
 * (`QUICK_ITEMS` de `QuickPills`) reste un import, pas une réécriture.
 *
 * Valider un texte NON précédé d'un mot-clé part vers l'Assistant — c'est le
 * filet par défaut, pas le mode Tâche : cette barre est celle de Spotlight,
 * pas celle du planificateur.
 */
export default function QuickNeutral({ value, onChange, onSubmit, autoFocus }: QuickNeutralProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-transparent bg-foreground/[0.035] p-2 transition-colors duration-300 focus-within:border-border/60 focus-within:bg-popover dark:bg-foreground/[0.05]"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl"
      >
        <span className="size-[18px] rounded-full border-2 border-dashed border-muted-foreground/30" />
      </span>
      <div className="min-w-0 flex-1">
        <AutoGrowTextarea
          value={value}
          onChange={onChange}
          onFocus={() => {}}
          onEnter={onSubmit}
          dateMatch={null}
          placeholder="Écrire, capturer, demander…"
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}
