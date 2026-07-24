"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { ACCENTS, useUIPrefs, type AccentId } from "@/components/ui-prefs";
import { spring } from "@/lib/motion";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";

const VALUES: readonly AccentId[] = ACCENTS.map((a) => a.id);

/** Pastilles d'aperçu (indépendantes du thème pour rester lisibles). */
const SWATCH: Record<AccentId, string> = {
  teal: "oklch(0.62 0.11 195)",
  indigo: "oklch(0.58 0.16 272)",
  violet: "oklch(0.6 0.19 300)",
  coral: "oklch(0.66 0.15 32)",
  amber: "oklch(0.7 0.13 78)",
  rose: "oklch(0.64 0.18 356)",
};

/**
 * Sélecteur d'accent : grille de pastilles rondes. La sélection pose un
 * anneau qui GLISSE d'une pastille à l'autre (layoutId) et une coche qui
 * « pop ». Persisté via UIPrefs (localStorage), appliqué instantanément.
 */
export function AccentPicker() {
  const { accent, setAccent } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, accent, setAccent);

  return (
    <div
      role="radiogroup"
      aria-label="Couleur d'accent"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-3"
    >
      {ACCENTS.map(({ id, label }, i) => {
        const active = id === accent;
        return (
          <motion.button
            key={id}
            type="button"
            onClick={() => setAccent(id)}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            transition={spring.snappy}
            aria-label={`Accent ${label}`}
            {...getItemProps(id, i)}
            title={label}
            className="relative grid size-8 place-items-center rounded-full"
            style={{ background: SWATCH[id] }}
          >
            {active && (
              <motion.span
                layoutId="accent-ring"
                aria-hidden
                className="absolute -inset-[5px] rounded-full border-2"
                style={{ borderColor: SWATCH[id] }}
                transition={spring.snappy}
              />
            )}
            <AnimatePresence>
              {active && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={spring.bouncy}
                  className="grid place-items-center"
                >
                  <Check size={14} strokeWidth={3.2} className="text-white" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
