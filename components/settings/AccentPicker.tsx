"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { ACCENTS, useUIPrefs, type AccentId } from "@/components/ui-prefs";
import { spring } from "@/lib/motion";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";
import { cn } from "@/lib/utils";

const VALUES: readonly AccentId[] = ACCENTS.map((a) => a.id);

/**
 * Sélecteur d'accent : rangée de pastilles rondes. `size="sm"` pour une ligne
 * de réglage, où le contrôle se range à droite du libellé. La sélection pose un
 * anneau qui GLISSE d'une pastille à l'autre (layoutId) et une coche qui
 * « pop ». Persisté via UIPrefs (localStorage), appliqué instantanément.
 *
 * Chaque pastille porte son propre `data-accent` : elle lit donc les MÊMES
 * couleurs que l'app (globals.css), dans le thème courant — y compris la
 * couleur de la coche, blanche ou encre selon l'accent. Pas de copie à part
 * qui finirait par diverger.
 */
export function AccentPicker({ size = "default" }: { size?: "sm" | "default" }) {
  const small = size === "sm";
  const { accent, setAccent } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, accent, setAccent);

  return (
    <div
      role="radiogroup"
      aria-label="Couleur d'accent"
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap items-center", small ? "gap-2.5" : "gap-3")}
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
            data-accent={id}
            className={cn("relative grid place-items-center rounded-full bg-brand", small ? "size-5" : "size-8")}
          >
            {active && (
              <motion.span
                layoutId="accent-ring"
                aria-hidden
                className={cn(
                  "absolute rounded-full border-brand",
                  small ? "-inset-[4px] border-[1.5px]" : "-inset-[5px] border-2",
                )}
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
                  <Check size={small ? 11 : 14} strokeWidth={3.2} className="text-brand-foreground" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
