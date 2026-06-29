"use client";

import { cn } from "@/lib/utils";

interface ListFilterProps {
  lists: string[];
  value: string | null;
  onChange: (list: string | null) => void;
}

/** Chips de filtrage par liste (« Toutes » + chaque liste). Masqué si aucune liste. */
export function ListFilter({ lists, value, onChange }: ListFilterProps) {
  if (lists.length === 0) return null;

  const chip = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:bg-accent",
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={chip(value === null)}
      >
        Toutes
      </button>
      {lists.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={chip(value === name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
