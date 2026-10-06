"use client";

import { useId, type ComponentType } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  Icon?: ComponentType<{ size?: number; className?: string }>;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}

/**
 * Choix un-parmi-N compact, à la taille de son contenu — le même registre que
 * la bascule Écrire/Aperçu des notes : un rail à peine teinté, un pouce à plat
 * qui glisse (ressort `snappy`, sans rebond) avec l'ombre de contact codifiée
 * des segmented controls (DESIGN-SYSTEM §2.1).
 *
 * Chaque instance porte son propre `layoutId` (`useId`) : deux groupes sur la
 * même page ne se volent jamais leur pouce.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ...aria
}: SegmentedProps<T>) {
  const thumbId = useId();
  const values = options.map((o) => o.value);
  const { onKeyDown, getItemProps } = useRovingRadioGroup(values, value, onChange);

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center rounded-lg bg-foreground/[0.045] p-[3px] dark:bg-foreground/[0.07]",
        className,
      )}
    >
      {options.map(({ value: option, label, Icon }, i) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            {...getItemProps(option, i)}
            className={cn(
              "relative isolate flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {active && (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[6px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.04] dark:bg-accent dark:ring-white/[0.07]"
                transition={spring.snappy}
              />
            )}
            {Icon && <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
