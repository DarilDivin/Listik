"use client";

import { motion } from "motion/react";
import {
  REFLECTION_STYLES,
  useUIPrefs,
  type ReflectionStyleId,
} from "@/components/ui-prefs";
import { ReflectionMark } from "@/components/reflection/ReflectionMark";
import { spring } from "@/lib/motion";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";
import { cn } from "@/lib/utils";

const VALUES: readonly ReflectionStyleId[] = REFLECTION_STYLES.map((style) => style.id);

/**
 * Choix de la présence qui accompagne l'attente de l'Assistant. Chaque
 * variante garde un aperçu visible ; la variante active est la seule à tourner
 * pour que le réglage reste calme, même sur une petite machine. Sa phrase
 * (« Des idées qui se rejoignent ») vit dans l'info-bulle.
 */
export function ReflectionSetting() {
  const { reflection, setReflection } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, reflection, setReflection);

  return (
    <div
      role="radiogroup"
      aria-label="Animation de réflexion"
      onKeyDown={onKeyDown}
      className="grid grid-cols-4 gap-1 sm:grid-cols-6"
    >
      {REFLECTION_STYLES.map((style, index) => {
        const active = style.id === reflection;
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => setReflection(style.id)}
            {...getItemProps(style.id, index)}
            title={`${style.label} — ${style.description}`}
            className={cn(
              "relative isolate flex flex-col items-center justify-center gap-2 rounded-xl px-1 pt-3 pb-2.5 text-center outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="reflection-setting-selected"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-brand-soft"
                transition={spring.snappy}
              />
            )}
            <ReflectionMark preset={style.id} animate={active} size={34} />
            <span className="text-[11px] font-medium leading-none">{style.label}</span>
          </button>
        );
      })}
    </div>
  );
}
