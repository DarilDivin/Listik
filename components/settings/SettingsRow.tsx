import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
  /** Contrôle pleine largeur placé sous le libellé (sinon à droite). */
  stacked?: boolean;
  /** Atténue la ligne (fonctionnalité à venir). */
  dimmed?: boolean;
}

/** Une ligne de réglage : libellé (+ description) et son contrôle. */
export function SettingsRow({
  label,
  description,
  children,
  stacked = false,
  dimmed = false,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "px-4 py-3.5",
        stacked ? "space-y-3" : "flex items-center justify-between gap-4",
        dimmed && "opacity-55",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && <div className={stacked ? "" : "shrink-0"}>{children}</div>}
    </div>
  );
}
