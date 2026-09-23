"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import {
  REFLECTION_STYLES,
  useUIPrefs,
  type ReflectionStyleId,
} from "@/components/ui-prefs";
import { ReflectionMark } from "@/components/reflection/ReflectionMark";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";
import { cn } from "@/lib/utils";

const VALUES: readonly ReflectionStyleId[] = REFLECTION_STYLES.map((style) => style.id);

/**
 * Choix de la présence qui accompagne l'attente de l'Assistant. Chaque
 * variante garde un aperçu visible ; la variante active est la seule à tourner
 * pour que le réglage reste calme, même sur une petite machine.
 */
export function ReflectionSetting() {
  const { reflection, setReflection } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, reflection, setReflection);

  return (
    <div
      role="radiogroup"
      aria-label="Animation de réflexion"
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
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
              "relative flex min-h-[108px] flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-center outline-none transition-colors duration-200",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="reflection-setting-selected"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-brand-soft ring-1 ring-brand/25"
                transition={{ type: "spring", stiffness: 380, damping: 31 }}
              />
            )}
            <ReflectionMark preset={style.id} animate={active} size={42} className="relative" />
            <span className="relative text-[11px] font-medium leading-none">{style.label}</span>
            <span className="relative line-clamp-2 text-[10px] leading-[1.3] text-muted-foreground">
              {style.description}
            </span>
            {active && <Check className="absolute right-2 top-2 size-3 text-brand" strokeWidth={2.5} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
