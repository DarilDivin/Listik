"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ListFilterProps {
  lists: string[];
  value: string | null;
  onChange: (list: string | null) => void;
}

/**
 * Chips de filtrage par liste (« Toutes » + chaque liste). La pastille active
 * glisse entre les chips (layoutId partagé). Masqué si aucune liste.
 */
export function ListFilter({ lists, value, onChange }: ListFilterProps) {
  if (lists.length === 0) return null;

  const options: { key: string | null; label: string }[] = [
    { key: null, label: "Toutes" },
    ...lists.map((name) => ({ key: name as string | null, label: name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map(({ key, label }) => {
        const active = value === key;
        return (
          <motion.button
            key={key ?? "__all__"}
            type="button"
            onClick={() => onChange(key)}
            whileTap={{ scale: 0.96 }}
            transition={spring.snappy}
            className={cn(
              "relative whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
              active
                ? "text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="list-filter-pill"
                aria-hidden
                className="absolute inset-0 rounded-full bg-brand"
                transition={spring.snappy}
              />
            )}
            <span className="relative z-10">{label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
