"use client";

import { motion } from "motion/react";
import { Circle, CircleDot, Rows3, Timer } from "lucide-react";
import { useUIPrefs, PULSE_STYLES, type PulseStyleId } from "@/components/ui-prefs";
import { cn } from "@/lib/utils";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";

const ICONS: Record<PulseStyleId, typeof Circle> = {
  ring: Circle,
  dial: CircleDot,
  bar: Rows3,
  countdown: Timer,
};

const VALUES: readonly PulseStyleId[] = PULSE_STYLES.map((p) => p.id);

/**
 * Choix du traitement du pouls du jour (même pattern que `NavSetting`) : la
 * pastille active glisse, le changement s'applique immédiatement.
 *
 * Quatre colonnes plutôt que deux, donc des libellés d'un seul mot — le détail
 * de ce que chacun met en avant vit dans la description de la ligne, pas dans
 * des étiquettes qui déborderaient.
 */
export function PulseSetting() {
  const { pulse, setPulse } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, pulse, setPulse);

  return (
    <div
      role="radiogroup"
      aria-label="Pouls du jour"
      onKeyDown={onKeyDown}
      className="grid grid-cols-4 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1"
    >
      {PULSE_STYLES.map(({ id, label }, i) => {
        const Icon = ICONS[id];
        const isActive = pulse === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPulse(id)}
            {...getItemProps(id, i)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-colors duration-200",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="pulse-setting-thumb"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-card/90 ring-1 ring-foreground/10"
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 color-mix(in oklch, white 22%, transparent), 0 1px 3px 0 rgb(0 0 0 / 0.10)",
                }}
                transition={{ type: "spring", bounce: 0.28, duration: 0.55 }}
              />
            )}
            <Icon size={15} className="relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
