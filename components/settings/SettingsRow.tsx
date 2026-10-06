import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Contrôle pleine largeur placé sous le libellé (sinon à droite). */
  stacked?: boolean;
  /** Atténue la ligne (fonctionnalité à venir). */
  dimmed?: boolean;
  /** Ligne rattachée à celle du dessus (ex. l'heure du résumé) : en retrait. */
  nested?: boolean;
}

/**
 * Une ligne de réglage, comme une ligne de tâche : le libellé et une phrase
 * à gauche, un contrôle compact à droite. Les lignes d'un groupe sont
 * séparées par des hairlines (`SettingsGroup`), jamais par des cartes.
 */
export function SettingsRow({
  label,
  description,
  children,
  stacked = false,
  dimmed = false,
  nested = false,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "py-3.5",
        stacked ? "space-y-3.5" : "flex items-center justify-between gap-6",
        nested && "pl-5",
        dimmed && "opacity-55",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && <div className={stacked ? "" : "shrink-0"}>{children}</div>}
    </div>
  );
}
