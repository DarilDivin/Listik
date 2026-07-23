"use client";

import { AnimatePresence, motion } from "motion/react";
import { Archive, ArrowRight, Check, FolderOpen, Sun, Trash2, X } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Area, Project } from "@/features/projects/types";

interface SelectionBarProps {
  count: number;
  projects: Project[];
  areas: Area[];
  onScheduleToday: () => void;
  onScheduleTomorrow: () => void;
  onSomeday: () => void;
  onComplete: () => void;
  onAssignProject: (projectId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * Barre d'actions par lot — flotte au-dessus de la capture dès qu'au moins une
 * tâche est sélectionnée. Chaque action rejoue en boucle les mutations
 * existantes puis vide la sélection. `.card-floating` est réservé au chrome qui
 * flotte au-dessus du contenu : c'en est un.
 */
export function SelectionBar({
  count,
  projects,
  areas,
  onScheduleToday,
  onScheduleTomorrow,
  onSomeday,
  onComplete,
  onAssignProject,
  onDelete,
  onClear,
}: SelectionBarProps) {
  const activeProjects = projects.filter((p) => p.status === "active");

  const Action = ({
    icon,
    label,
    onClick,
    destructive = false,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    destructive?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={spring.pop}
          className="pointer-events-auto flex items-center gap-1 rounded-2xl card-floating px-2 py-1.5"
          role="toolbar"
          aria-label="Actions sur la sélection"
        >
          <span className="flex items-center gap-1.5 px-2 text-sm font-semibold text-foreground">
            <span className="font-mono tabular-nums text-brand">
              <AnimatedNumber value={count} />
            </span>
            <span className="text-muted-foreground max-sm:hidden">
              sélectionnée{count > 1 ? "s" : ""}
            </span>
          </span>

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

          <Action icon={<Sun size={15} />} label="Aujourd'hui" onClick={onScheduleToday} />
          <Action icon={<ArrowRight size={15} />} label="Demain" onClick={onScheduleTomorrow} />
          <Action icon={<Archive size={15} />} label="Un jour" onClick={onSomeday} />
          <Action icon={<Check size={15} />} label="Terminer" onClick={onComplete} />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={activeProjects.length === 0}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
              >
                <FolderOpen size={15} />
                <span className="max-sm:hidden">Projet…</span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-56 p-1">
              <div className="max-h-56 overflow-y-auto">
                {activeProjects.map((project) => {
                  const area = areas.find((a) => a.id === project.area_id);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onAssignProject(project.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      <FolderOpen size={13} className="shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{project.name}</span>
                      {area && (
                        <span className="truncate text-[11px] text-muted-foreground/60">
                          {area.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          <Action icon={<Trash2 size={15} />} label="Supprimer" onClick={onDelete} destructive />

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

          <button
            type="button"
            onClick={onClear}
            aria-label="Vider la sélection"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X size={15} />
            <Kbd className="max-sm:hidden">Échap</Kbd>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
