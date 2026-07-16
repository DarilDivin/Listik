"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ListFilterProps {
  /** Entrées filtrables (projets) : `id` sert de clé, `label` est affiché. */
  items: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * Chips de filtrage par projet (« Tous » + chaque projet). La pastille active
 * glisse entre les chips (layoutId partagé). Masqué si aucun projet.
 */
export function ListFilter({ items, value, onChange }: ListFilterProps) {
  if (items.length === 0) return null;

  const options: { key: string | null; label: string }[] = [
    { key: null, label: "Tous" },
    ...items.map((item) => ({ key: item.id as string | null, label: item.label })),
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
