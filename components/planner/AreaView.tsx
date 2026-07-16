"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { AnimatedTodoList } from "@/components/todo/AnimatedTodoList";
import { EmptyState } from "@/components/todo/EmptyState";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { pressable, spring } from "@/lib/motion";
import type { Area, Project } from "@/features/projects/types";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";

interface AreaViewProps {
  area: Area;
  /** Projets rattachés à ce domaine (actifs). */
  projects: Project[];
  /** Tâches rangées DIRECTEMENT dans le domaine (sans projet). */
  todos: Todo[];
  progressOf: (projectId: string) => { done: number; total: number };
  onOpenProject: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, payload: UpdateTodoInput) => void;
  onRename: (name: string) => void;
}

/**
 * Vue d'un domaine : ses projets, puis les tâches qu'on y a rangées
 * directement (sans projet intermédiaire — c'est possible dans Things).
 * Un domaine n'a pas de date de fin : ni deadline, ni anneau global.
 */
export function AreaView({
  area,
  projects,
  todos,
  progressOf,
  onOpenProject,
  onToggle,
  onDelete,
  onUpdate,
  onRename,
}: AreaViewProps) {
  const [title, setTitle] = useState(area.name);

  useEffect(() => {
    setTitle(area.name);
  }, [area.id, area.name]);

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== area.name) onRename(next);
    else setTitle(area.name);
  };

  const pending = todos.filter((t) => t.status === "pending");
  const isEmpty = projects.length === 0 && pending.length === 0;

  return (
    <>
      <div className="pt-8">
        <div className="border-b border-border/60 pb-6">
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            placeholder="Nom du domaine"
            className="w-full resize-none bg-transparent text-[2rem] font-bold leading-tight tracking-[-0.025em] text-foreground outline-none field-sizing-content placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      <div className="pb-10 pt-4">
        {isEmpty && (
          <EmptyState
            title="Domaine vide"
            subtitle="Créez un projet ici depuis le rail, ou capturez une tâche ci-dessous."
          />
        )}

        {projects.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 px-3 pb-2">
              <span aria-hidden className="size-2 rounded-full bg-muted-foreground/35" />
              <span className="text-[13px] font-semibold tracking-[-0.005em] text-muted-foreground">
                Projets
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/50">
                <AnimatedNumber value={projects.length} />
              </span>
            </h3>

            <div className="space-y-0.5">
              {projects.map((project, i) => {
                const { done, total } = progressOf(project.id);
                return (
                  <motion.button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { ...spring.smooth, delay: i * 0.04 },
                    }}
                    {...pressable}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    {total > 0 ? (
                      <ProgressRing progress={done / total} size={16} strokeWidth={2.5} />
                    ) : (
                      <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate text-sm text-foreground">
                      {project.name}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">
                      {done}/{total}
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </motion.button>
                );
              })}
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section className={projects.length > 0 ? "mt-6 border-t border-border/60 pt-4" : ""}>
            <h3 className="flex items-center gap-2 px-3 pb-2">
              <span aria-hidden className="size-2 rounded-full bg-muted-foreground/35" />
              <span className="text-[13px] font-semibold tracking-[-0.005em] text-muted-foreground">
                Tâches
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/50">
                <AnimatedNumber value={pending.length} />
              </span>
            </h3>
            <AnimatedTodoList
              todos={pending}
              onToggle={onToggle}
              onDelete={onDelete}
              onUpdate={onUpdate}
              showDate
            />
          </section>
        )}
      </div>
    </>
  );
}
