"use client";

import { cn } from "@/lib/utils";
import type { OmnibarCommand } from "@/features/omnibar/commands";

interface ModeBadgeProps {
  command: OmnibarCommand;
  /** Si fourni, le badge devient cliquable pour revenir au mode par défaut. */
  onClear?: () => void;
}

/**
 * Pastille (icône seule, colorée) indiquant le mode actif de l'Omnibar.
 * Carré fixe aligné en haut (`self-start`) : il remplit la hauteur sur une
 * seule ligne et reste carré, ancré à la 1re ligne, en saisie multi-ligne.
 */
export function ModeBadge({ command, onClear }: ModeBadgeProps) {
  const Icon = command.icon;

  const className = cn(
    "grid size-9 shrink-0 self-start place-items-center rounded-xl transition",
    command.color,
    !command.enabled && "opacity-80",
    onClear && "cursor-pointer hover:brightness-95 dark:hover:brightness-110",
  );

  const icon = <Icon className="size-[18px]" />;

  if (onClear) {
    return (
      <button
        type="button"
        title={`Mode ${command.label} — cliquer pour revenir au mode par défaut`}
        aria-label="Revenir au mode par défaut"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        className={className}
      >
        {icon}
      </button>
    );
  }

  return (
    <span className={className} aria-label={command.label} title={command.label}>
      {icon}
    </span>
  );
}
