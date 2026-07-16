"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { AnimatedTodoList } from "@/components/todo/AnimatedTodoList";
import { EmptyState } from "@/components/todo/EmptyState";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { spring } from "@/lib/motion";
import type { Project } from "@/features/projects/types";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";

interface ProjectViewProps {
  project: Project;
  /** Tâches du projet (terminées comprises) — filtrées par `project_id`. */
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, payload: UpdateTodoInput) => void;
  onRename: (name: string) => void;
  onChangeNote: (note: string | null) => void;
  /** Achève/réactive le projet ; `completeTasks` termine aussi les tâches ouvertes. */
  onComplete: (completeTasks: boolean) => void;
  onReopen: () => void;
}

/**
 * Vue d'un projet : en-tête posé sur le canvas (titre et note éditables, anneau
 * de progression) puis ses tâches. Un projet n'est PAS un horizon temporel — la
 * liste vient d'un filtre direct sur `project_id`, jamais des groupes GTD : une
 * tâche datée doit apparaître à la fois dans « Aujourd'hui » et ici.
 */
export function ProjectView({
  project,
  todos,
  onToggle,
  onDelete,
  onUpdate,
  onRename,
  onChangeNote,
  onComplete,
  onReopen,
}: ProjectViewProps) {
  const [title, setTitle] = useState(project.name);
  const [note, setNote] = useState(project.note ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Resynchronise si le projet change (ou est renommé depuis le rail).
  useEffect(() => {
    setTitle(project.name);
    setNote(project.note ?? "");
  }, [project.id, project.name, project.note]);

  const pending = todos.filter((t) => t.status === "pending");
  const done = todos.filter((t) => t.status === "completed");
  const total = todos.length;
  const completed = project.status === "completed";

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== project.name) onRename(next);
    else setTitle(project.name);
  };

  const saveNote = () => {
    const next = note.trim();
    if (next !== (project.note ?? "")) onChangeNote(next || null);
  };

  // Terminer un projet avec des tâches ouvertes est une décision, pas un effet
  // de bord : on demande. Cascader en silence surprendrait ; laisser des tâches
  // vivantes dans un projet achevé serait pire (elles disparaîtraient de la vue).
  const requestComplete = () => {
    if (pending.length > 0) setConfirmOpen(true);
    else onComplete(false);
  };

  return (
    <>
      <div className="pt-8">
        <div className="flex items-start justify-between gap-6 border-b border-border/60 pb-6">
          <div className="min-w-0 flex-1">
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
              placeholder="Nom du projet"
              className="w-full resize-none bg-transparent text-[2rem] font-bold leading-tight tracking-[-0.025em] text-foreground outline-none field-sizing-content placeholder:text-muted-foreground/40"
            />
            <textarea
              value={note}
              rows={1}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Ajouter une note…"
              className="mt-1 w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none field-sizing-content placeholder:text-muted-foreground/40"
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.05 }}
            className="flex shrink-0 items-center gap-3"
          >
            <ProgressRing
              progress={total > 0 ? done.length / total : 0}
              size={40}
              strokeWidth={3}
            />
            <div className="flex flex-col gap-0.5 pr-1">
              <span className="flex items-baseline gap-1 font-mono tabular-nums">
                <AnimatedNumber
                  value={done.length}
                  className="text-2xl font-semibold text-foreground"
                />
                <span className="text-sm text-muted-foreground/60">/ {total}</span>
              </span>
              <span className="text-xs text-muted-foreground">terminées</span>
            </div>
          </motion.div>
        </div>

        <div className="flex justify-end pt-3">
          {completed ? (
            <Button variant="ghost" size="sm" onClick={onReopen}>
              <RotateCcw />
              Rouvrir le projet
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={requestComplete}>
              <CheckCircle2 />
              Terminer le projet
            </Button>
          )}
        </div>
      </div>

      <div className="pb-10 pt-4">
        {pending.length > 0 ? (
          <AnimatedTodoList
            todos={pending}
            onToggle={onToggle}
            onDelete={onDelete}
            onUpdate={onUpdate}
            showDate
          />
        ) : (
          <EmptyState
            title={total === 0 ? "Projet vide" : "Tout est fait"}
            subtitle={
              total === 0
                ? "Capturez la première tâche de ce projet ci-dessous."
                : "Plus rien à faire ici — beau travail."
            }
          />
        )}

        {done.length > 0 && (
          <div className="mt-6 border-t border-border/60 pt-4">
            <h3 className="flex items-center gap-2 px-3 pb-2">
              <span
                aria-hidden
                className="size-2 rounded-full bg-muted-foreground/35"
              />
              <span className="text-[13px] font-semibold tracking-[-0.005em] text-muted-foreground">
                Terminées
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/50">
                <AnimatedNumber value={done.length} />
              </span>
            </h3>
            <AnimatedTodoList
              todos={done}
              onToggle={onToggle}
              onDelete={onDelete}
              onUpdate={onUpdate}
              showDate
            />
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer « {project.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Il reste {pending.length} tâche{pending.length > 1 ? "s" : ""} à
              faire. Voulez-vous aussi {pending.length > 1 ? "les" : "la"}{" "}
              terminer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                onComplete(false);
                setConfirmOpen(false);
              }}
            >
              Garder les tâches
            </Button>
            <AlertDialogAction
              onClick={() => {
                onComplete(true);
                setConfirmOpen(false);
              }}
            >
              Tout terminer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
