"use client";

import * as React from "react";
import { Check, FolderOpen, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Area, Project } from "@/features/projects/types";

interface ProjectControlProps {
  /** Projet actuel de la tâche, ou null. */
  projectId: string | null;
  projects: Project[];
  areas: Area[];
  dimmed?: boolean;
  /**
   * OBLIGATOIRE à l'intérieur d'un Dialog/Sheet : le popover monte alors son
   * propre FocusScope, qui met en pause celui du dialog — sans ça, le dialog
   * rapatrie le focus et le champ « Nouveau projet… » est insaisissable.
   */
  modal?: boolean;
  onChange: (projectId: string | null) => void;
  /** Crée un projet et renvoie son id (pour l'assigner dans la foulée). */
  onCreate: (name: string) => Promise<string>;
}

/**
 * Projet d'une tâche : (ré)assigner ou créer. Remplace `ListControl` — on parle
 * désormais en identifiants de projet, plus en texte libre.
 *
 * Les projets sont groupés par domaine, comme dans le rail : le même objet doit
 * se retrouver au même endroit partout.
 */
export function ProjectControl({
  projectId,
  projects,
  areas,
  dimmed = false,
  modal = false,
  onChange,
  onCreate,
}: ProjectControlProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const current = projects.find((p) => p.id === projectId) ?? null;

  const pick = (next: string | null) => {
    onChange(next);
    setDraft("");
    setOpen(false);
  };

  const createDraft = async () => {
    const name = draft.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // Réutilise un projet de même nom (insensible à la casse) plutôt que
      // d'en créer un doublon — même politique que la réconciliation en Rust.
      const existing = projects.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      pick(existing ? existing.id : await onCreate(name));
    } finally {
      setCreating(false);
    }
  };

  // Groupés par domaine (domaines dans l'ordre, puis les projets sans domaine).
  const grouped = React.useMemo(() => {
    const active = projects.filter((p) => p.status === "active");
    const sections = areas
      .map((area) => ({
        label: area.name,
        items: active.filter((p) => p.area_id === area.id),
      }))
      .filter((s) => s.items.length > 0);
    const orphans = active.filter((p) => !p.area_id);
    if (orphans.length > 0) {
      sections.push({ label: areas.length > 0 ? "Sans domaine" : "", items: orphans });
    }
    return sections;
  }, [projects, areas]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={current ? "Changer de projet" : "Assigner un projet"}
          className={cn(
            "flex h-9 max-w-[12rem] items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 outline-none",
            !current && "text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          <FolderOpen
            size={14}
            className="shrink-0 text-muted-foreground opacity-70"
          />
          <span className="truncate">{current?.name ?? "Projet"}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-56 p-1"
      >
        <div className="max-h-52 overflow-y-auto">
          {current && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Aucun projet
            </button>
          )}

          {grouped.map((section) => (
            <div key={section.label || "orphans"}>
              {section.label && (
                <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  {section.label}
                </p>
              )}
              {section.items.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => pick(project.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
                    project.id === projectId && "bg-accent/60",
                  )}
                >
                  <FolderOpen size={13} className="shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">{project.name}</span>
                  {project.id === projectId && (
                    <Check className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ))}
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
            placeholder="Nouveau projet…"
            className="w-full rounded-md bg-transparent px-1 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
