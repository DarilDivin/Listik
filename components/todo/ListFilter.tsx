"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ListFilterProps {
  /** Entrées filtrables (tags) : `id` sert de clé, `label` est affiché. */
  items: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * Chips de filtrage par tag (« Tous » + chaque tag), actif dans toutes les
 * vues. La pastille active glisse entre les chips (layoutId partagé).
 *
 * Il n'y a volontairement qu'UNE dimension de filtre : le rattachement
 * (domaine/projet) se navigue dans le rail, pas ici. Empiler deux rangées de
 * chips poserait une question de ET/OU que l'interface ne sait pas exprimer.
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
                layoutId="tag-filter-pill"
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
