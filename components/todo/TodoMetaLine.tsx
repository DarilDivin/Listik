"use client";

import { BellRing, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { recurrenceLabel } from "@/features/todos/recurrence";
import { TodoDate } from "@/components/todo/TodoDate";
import { useProjects } from "@/hooks/useProjects";
import { useTagFilter } from "@/features/tags/tag-filter";
import type { Todo } from "@/features/todos/types";

/** Étiquette compacte d'un rappel : heure seule si même jour que la tâche. */
function reminderLabel(remindAt: string, scheduledFor: string | null): string {
  const time = remindAt.slice(11, 16);
  if (scheduledFor && remindAt.slice(0, 10) === scheduledFor) return time;
  const [y, m, d] = remindAt.slice(0, 10).split("-").map(Number);
  const short = new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  return `${short} ${time}`;
}

interface TodoMetaLineProps {
  todo: Todo;
  /** Affiche la date planifiée — à couper quand la section groupe déjà par jour. */
  showDate?: boolean;
  overdue?: boolean;
  dimmed?: boolean;
}

/**
 * Ligne de métadonnées d'une tâche : purement d'affichage, façon Things 3 —
 * projet en pastille mate, date/récurrence/rappel en texte discret. Toujours
 * montée dès qu'une donnée existe (jamais révélée au survol) : la structure
 * de la ligne ne dépend donc jamais de l'interaction, seulement des données.
 * L'édition de ces champs vit dans `TodoDetailSheet`, pas ici.
 */
export function TodoMetaLine({
  todo,
  showDate = true,
  overdue = false,
  dimmed = false,
}: TodoMetaLineProps) {
  // Fourni par le planner ; absent ailleurs (fenêtre quick…) → simples étiquettes.
  const onFilterTag = useTagFilter();
  // Le nom vient de la table `projects` (SWR partagé : une seule requête pour
  // toutes les lignes). `todo.list` reste un repli d'affichage pour une tâche
  // héritée que la réconciliation n'aurait pas encore convertie.
  const { projects } = useProjects();
  const projectName =
    projects.find((p) => p.id === todo.project_id)?.name ?? todo.list;

  const hasDate = showDate && Boolean(todo.scheduled_for);
  const hasAny =
    hasDate ||
    projectName ||
    todo.tags.length > 0 ||
    todo.recurrence !== "none" ||
    todo.remind_at;

  if (!hasAny) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {hasDate && todo.scheduled_for && (
        <TodoDate date={todo.scheduled_for} dimmed={dimmed} overdue={overdue} />
      )}

      {projectName && (
        <span
          className={cn(
            "inline-flex items-center rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          {projectName}
        </span>
      )}

      {todo.tags.map((tag) => {
        const chip =
          "inline-flex items-center rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground";
        return onFilterTag ? (
          <button
            key={tag.id}
            type="button"
            // La ligne entière ouvre le panneau de détail : sans ça, filtrer
            // par un tag ouvrirait aussi la tâche.
            onClick={(e) => {
              e.stopPropagation();
              onFilterTag(tag.id);
            }}
            className={cn(
              chip,
              "transition-colors hover:bg-foreground/[0.1] hover:text-foreground",
              dimmed && "opacity-60",
            )}
          >
            {tag.name}
          </button>
        ) : (
          <span key={tag.id} className={cn(chip, dimmed && "opacity-60")}>
            {tag.name}
          </span>
        );
      })}

      {todo.recurrence !== "none" && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          <Repeat size={12} className="opacity-70" />
          {recurrenceLabel(todo.recurrence)}
        </span>
      )}

      {todo.remind_at && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground",
            dimmed && "opacity-60",
          )}
        >
          <BellRing size={12} className="opacity-70" />
          {reminderLabel(todo.remind_at, todo.scheduled_for)}
        </span>
      )}
    </div>
  );
}
