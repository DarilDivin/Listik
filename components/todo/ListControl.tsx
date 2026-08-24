"use client";

import * as React from "react";
import { Check, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ListControlProps {
  /** Liste actuelle de la tâche, ou null. */
  list: string | null;
  /** Listes existantes proposées. */
  lists: string[];
  dimmed?: boolean;
  /**
   * OBLIGATOIRE à l'intérieur d'un Dialog/Sheet : le popover monte alors son
   * propre FocusScope, qui met en pause celui du dialog — sans ça, le dialog
   * rapatrie le focus et le champ « Nouvelle liste… » est insaisissable.
   */
  modal?: boolean;
  onChange: (list: string | null) => void;
}

/**
 * Liste/projet d'une tâche, cliquable pour (ré)assigner ou créer une liste.
 * Pastille toujours montée (barre de saisie, formulaire de détail) — pas de
 * révélation au survol, ce composant est réservé aux contextes où le champ
 * est déjà visible en permanence.
 */
export function ListControl({
  list,
  lists,
  dimmed = false,
  modal = false,
  onChange,
}: ListControlProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const pick = (next: string | null) => {
    onChange(next);
    setDraft("");
    setOpen(false);
  };

  const createDraft = () => {
    const name = draft.trim();
    if (name) pick(name);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={list ? "Changer de liste" : "Assigner une liste"}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 outline-none",
            !list && "text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          <Tag size={14} className="shrink-0 text-muted-foreground opacity-70" />
          {list ?? "Liste"}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-52 p-1"
      >
        <div className="max-h-44 overflow-y-auto">
          {list && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Aucune liste
            </button>
          )}
          {lists.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
                name === list && "bg-accent/60",
              )}
            >
              <Tag size={13} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-left">{name}</span>
              {name === list && <Check className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>

        <div className="mt-1 border-t border-border pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Nouvelle liste…"
            className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
