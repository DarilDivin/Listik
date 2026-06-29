"use client";

import { motion } from "motion/react";

export type TodoFilter = "all" | "pending" | "completed";

interface FilterTabsProps {
  value: TodoFilter;
  onChange: (filter: TodoFilter) => void;
  counts: Record<TodoFilter, number>;
}

const TABS: { key: TodoFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "pending", label: "En attente" },
  { key: "completed", label: "Terminées" },
];

/** Onglets de filtrage avec indicateur souligné glissant. */
export function FilterTabs({ value, onChange, counts }: FilterTabsProps) {
  return (
    <div className="flex items-center">
      {TABS.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`relative px-3 py-2.5 text-sm transition-colors duration-200 ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {label}
              <span
                className={`text-xs tabular-nums transition-colors ${
                  active ? "text-foreground/45" : "text-muted-foreground/45"
                }`}
              >
                {counts[key]}
              </span>
            </span>
            {active && (
              <motion.span
                layoutId="filter-underline"
                className="absolute inset-x-2 -bottom-px h-px bg-foreground"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
