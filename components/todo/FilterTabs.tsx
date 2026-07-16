"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";

export type TodoFilter = "all" | "pending" | "completed";

interface FilterTabsProps {
  value: TodoFilter;
  onChange: (filter: TodoFilter) => void;
  counts: Record<TodoFilter, number>;
}

const TABS: { key: TodoFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "pending", label: "En cours" },
  { key: "completed", label: "Terminées" },
];

/**
 * Segmented control façon iOS : le « pouce » (carte claire, ombre de contact)
 * glisse d'un segment à l'autre en ressort (layoutId partagé).
 */
export function FilterTabs({ value, onChange, counts }: FilterTabsProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-[3px] dark:bg-foreground/[0.08]">
      {TABS.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "relative rounded-[10px] px-3 py-1 text-[13px] transition-colors duration-200",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="filter-thumb"
                aria-hidden
                className="absolute inset-0 rounded-[10px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] dark:bg-accent dark:ring-white/[0.07]"
                transition={spring.snappy}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {label}
              <AnimatedNumber
                value={counts[key]}
                className={cn(
                  "font-mono text-[11px] tabular-nums transition-colors",
                  active ? "text-foreground/45" : "text-muted-foreground/45",
                )}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
