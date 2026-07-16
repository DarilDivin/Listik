"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Flag,
  RotateCcw,
  SquarePen,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { Priority, Todo, UpdateTodoInput } from "@/features/todos/types";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import { TodoCheckbox } from "@/components/todo/TodoCheckbox";
import { TodoMetaLine } from "@/components/todo/TodoMetaLine";
import { TodoDetailSheet } from "@/components/todo/TodoDetailSheet";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TodoItemProps {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  showDate?: boolean;
  overdue?: boolean;
  /** Listes existantes proposées (pour le champ liste du formulaire de détail). */
  lists?: string[];
  /** Si fourni, la tâche devient éditable — un clic ouvre son formulaire de détail. */
  onUpdate?: (payload: UpdateTodoInput) => void;
}

const titleVariants = {
  pending: { color: "var(--color-foreground)" },
  completed: { color: "var(--color-muted-foreground)" },
};

/**
 * Ligne de tâche : purement d'affichage — checkbox, titre, note, métadonnées
 * (voir `TodoMetaLine`). Sa structure ne dépend JAMAIS de l'état d'interaction
 * (survol, édition) : c'est ce qui rend le glissement des lignes voisines
 * fluide. Toute édition (titre, note, date, liste, récurrence, rappel,
 * priorité, suppression) vit dans `TodoDetailSheet`, ouvert au clic sur la
 * ligne ou via le menu contextuel.
 */
export function TodoItem({
  todo,
  onToggle,
  onDelete,
  showDate = false,
  overdue = false,
  lists = [],
  onUpdate,
}: TodoItemProps) {
  const isCompleted = todo.status === "completed";
  const editable = Boolean(onUpdate);

  const [hovered, setHovered] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const reschedule = (date: string) =>
    onUpdate?.({ scheduled_for: date, due_date: date });

  const tomorrowISO = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toLocalISODate(t);
  };

  const openDetail = () => editable && setDetailOpen(true);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            initial={false}
            animate={{ opacity: isCompleted ? 0.5 : 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
            }}
            className="group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.045]"
          >
            <TodoCheckbox checked={isCompleted} onToggle={onToggle} priority={todo.priority} />

            <div
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              aria-label={editable ? `Modifier « ${todo.text} »` : undefined}
              onClick={openDetail}
              onKeyDown={(e) => {
                if (editable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openDetail();
                }
              }}
              className={cn("min-w-0 flex-1 pt-px", editable && "cursor-pointer outline-none")}
            >
              <motion.p
                variants={titleVariants}
                initial={false}
                animate={isCompleted ? "completed" : "pending"}
                transition={{ duration: 0.25 }}
                className={cn(
                  "text-[15px] leading-snug tracking-[-0.01em] break-words",
                  isCompleted && "line-through decoration-1 decoration-muted-foreground/50",
                )}
              >
                {todo.text}
              </motion.p>

              {todo.note && (
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground">
                  {todo.note}
                </p>
              )}

              <TodoMetaLine
                todo={todo}
                showDate={showDate}
                overdue={overdue && !isCompleted}
                dimmed={isCompleted}
              />
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  onClick={onDelete}
                  animate={{ opacity: hovered ? 1 : 0 }}
                  transition={{ duration: 0.16 }}
                  whileTap={{ scale: 0.85, transition: spring.snappy }}
                  aria-label="Supprimer la tâche"
                  className={cn(
                    "-mr-1 mt-px shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive",
                    !hovered && "pointer-events-none",
                  )}
                >
                  <X size={15} />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={6}>
                Supprimer
              </TooltipContent>
            </Tooltip>
          </motion.div>
        </ContextMenuTrigger>

        {/* Clic droit : actions rapides, façon menu contextuel macOS. */}
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={onToggle}>
            {isCompleted ? <RotateCcw /> : <Check />}
            {isCompleted ? "Rouvrir" : "Terminer"}
          </ContextMenuItem>

          {editable && (
            <ContextMenuItem onSelect={openDetail}>
              <SquarePen />
              Modifier…
            </ContextMenuItem>
          )}

          {editable && !isCompleted && (
            <>
              <ContextMenuItem onSelect={() => reschedule(todayLocalISODate())}>
                <Sun />
                Aujourd&apos;hui
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => reschedule(tomorrowISO())}>
                <ArrowRight />
                Demain
              </ContextMenuItem>

              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Flag className="text-muted-foreground" />
                  Priorité
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-36">
                  <ContextMenuRadioGroup
                    value={todo.priority ?? "normal"}
                    onValueChange={(value) =>
                      onUpdate?.({ priority: value as Priority })
                    }
                  >
                    <ContextMenuRadioItem value="high">Haute</ContextMenuRadioItem>
                    <ContextMenuRadioItem value="normal">Normale</ContextMenuRadioItem>
                    <ContextMenuRadioItem value="low">Basse</ContextMenuRadioItem>
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Supprimer
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {editable && onUpdate && (
        <TodoDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          todo={todo}
          lists={lists}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </>
  );
}
