import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
  /** Contrôle pleine largeur placé sous le libellé (sinon à droite). */
  stacked?: boolean;
  /** Atténue la ligne (fonctionnalité à venir). */
  dimmed?: boolean;
  /** Icône de tête (carré arrondi coloré, façon réglages iOS). */
  icon?: LucideIcon;
  /** Couleur de fond de l'icône (classe Tailwind, ex. `bg-brand`). */
  iconClassName?: string;
}

/** Une ligne de réglage : icône optionnelle, libellé (+ description), contrôle. */
export function SettingsRow({
  label,
  description,
  children,
  stacked = false,
  dimmed = false,
  icon: Icon,
  iconClassName,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-2.5",
        stacked ? "items-start" : "items-center",
        dimmed && "opacity-55",
      )}
    >
      {Icon && (
        <div
          className={cn(
            // Pastille mate : fond légèrement teinté (même couleur, faible
            // opacité), seul le glyphe est coloré. Pas de dégradé ni brillance.
            "mt-px grid size-7 shrink-0 place-items-center rounded-[8px]",
            iconClassName ?? "bg-foreground/[0.06] text-muted-foreground",
          )}
        >
          <Icon size={16} strokeWidth={2.1} />
        </div>
      )}

      <div
        className={cn(
          "min-w-0 flex-1",
          stacked ? "space-y-2.5" : "flex items-center justify-between gap-4",
        )}
      >
        <div className="min-w-0">
          <p className="text-[0.9375rem] text-foreground">{label}</p>
          {description && (
            <p className="mt-0.5 text-[0.8rem] leading-snug text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children && <div className={stacked ? "" : "shrink-0"}>{children}</div>}
      </div>
    </div>
  );
}
