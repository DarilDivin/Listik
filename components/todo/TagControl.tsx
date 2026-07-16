"use client";

import * as React from "react";
import { Check, Hash, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Tag } from "@/features/tags/types";

interface TagControlProps {
  /** Tags actuellement portés par la tâche. */
  value: Tag[];
  /** Tous les tags existants. */
  tags: Tag[];
  dimmed?: boolean;
  /**
   * OBLIGATOIRE à l'intérieur d'un Dialog/Sheet : le popover monte alors son
   * propre FocusScope, qui met en pause celui du dialog — sans ça, le dialog
   * rapatrie le focus et le champ « Nouveau tag… » est insaisissable.
   */
  modal?: boolean;
  /** Remplace l'intégralité des tags de la tâche. */
  onChange: (tagIds: string[]) => void;
  /** Crée un tag et renvoie son id (get-or-create côté backend). */
  onCreate: (name: string) => Promise<string>;
}

/**
 * Tags d'une tâche : multi-sélection + création inline. Contrairement au projet
 * (un seul, structurant), les tags sont multiples et transverses — d'où une
 * liste à cocher plutôt qu'un choix exclusif.
 */
export function TagControl({
  value,
  tags,
  dimmed = false,
  modal = false,
  onChange,
  onCreate,
}: TagControlProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const selectedIds = React.useMemo(() => new Set(value.map((t) => t.id)), [value]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const createDraft = async () => {
    const name = draft.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // Réutilise un tag de même nom (insensible à la casse) plutôt que d'en
      // créer un doublon — même politique que le get-or-create du backend.
      const existing = tags.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      const id = existing ? existing.id : await onCreate(name);
      if (!selectedIds.has(id)) onChange([...selectedIds, id]);
      setDraft("");
    } finally {
      setCreating(false);
    }
  };

  const label =
    value.length === 0
      ? "Tags"
      : value.length <= 2
        ? value.map((t) => t.name).join(", ")
        : `${value.length} tags`;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value.length ? "Modifier les tags" : "Ajouter des tags"}
          className={cn(
            "flex h-9 max-w-[12rem] items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 outline-none",
            value.length === 0 && "text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          <Hash size={14} className="shrink-0 text-muted-foreground opacity-70" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-56 p-1"
      >
        <div className="max-h-52 overflow-y-auto">
          {tags.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">
              Aucun tag pour l&apos;instant.
            </p>
          )}
          {tags.map((tag) => {
            const checked = selectedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
                  checked && "bg-accent/60",
                )}
              >
                <Hash size={13} className="shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{tag.name}</span>
                {checked && <Check className="size-3.5 text-brand" />}
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex items-center gap-1 border-t border-border pt-1">
          <Plus size={13} className="ml-2 shrink-0 text-muted-foreground/60" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Nouveau tag…"
            className="w-full rounded-md bg-transparent px-1 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
