"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { BellRing, Plus, Repeat, Tag, X } from "lucide-react";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";
import { recurrenceLabel } from "@/features/todos/recurrence";
import { TodoCheckbox } from "@/components/todo/TodoCheckbox";
import { TodoDate } from "@/components/todo/TodoDate";
import { TodoDateControl } from "@/components/todo/TodoDateControl";
import { ListControl } from "@/components/todo/ListControl";
import { RecurrenceControl } from "@/components/todo/RecurrenceControl";
import { ReminderControl } from "@/components/todo/ReminderControl";
import { InlineEdit } from "@/components/todo/InlineEdit";

/** Étiquette compacte d'un rappel pour l'affichage en lecture seule. */
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

interface TodoItemProps {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  showDate?: boolean;
  overdue?: boolean;
  /** Listes existantes proposées (pour le contrôle de liste). */
  lists?: string[];
  /** Si fourni, la tâche devient éditable (texte/note au clic, date replanifiable). */
  onUpdate?: (payload: UpdateTodoInput) => void;
}

const titleVariants = {
  pending: { color: "var(--color-foreground)" },
  completed: { color: "var(--color-muted-foreground)" },
};

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
  const showMeta =
    showDate &&
    (editable ||
      Boolean(todo.scheduled_for) ||
      Boolean(todo.list) ||
      todo.recurrence !== "none" ||
      Boolean(todo.remind_at));

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNote, setEditingNote] = useState(false);

  const saveTitle = (value: string) => {
    const next = value.trim();
    if (next && next !== todo.text) onUpdate?.({ text: next });
    setEditingTitle(false);
  };

  const saveNote = (value: string) => {
    const next = value.trim();
    if (next !== (todo.note ?? "")) onUpdate?.({ note: next || null });
    setEditingNote(false);
  };

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: isCompleted ? 0.5 : 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.05]"
    >
      <TodoCheckbox checked={isCompleted} onToggle={onToggle} priority={todo.priority} />

      <div className="min-w-0 flex-1 pt-px">
        {editingTitle ? (
          <InlineEdit
            value={todo.text}
            submitOnEnter
            onSave={saveTitle}
            onCancel={() => setEditingTitle(false)}
            className="w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[15px] leading-snug tracking-[-0.01em] text-foreground outline-none"
          />
        ) : (
          <motion.p
            variants={titleVariants}
            initial={false}
            animate={isCompleted ? "completed" : "pending"}
            transition={{ duration: 0.25 }}
            onClick={() => editable && setEditingTitle(true)}
            className={`text-[15px] leading-snug tracking-[-0.01em] break-words ${
              editable ? "cursor-text" : ""
            } ${
              isCompleted ? "line-through decoration-1 decoration-muted-foreground/50" : ""
            }`}
          >
            {todo.text}
          </motion.p>
        )}

        {editingNote ? (
          <InlineEdit
            value={todo.note ?? ""}
            placeholder="Ajouter une note…"
            onSave={saveNote}
            onCancel={() => setEditingNote(false)}
            className="mt-1 w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[13px] leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50"
          />
        ) : todo.note ? (
          <p
            onClick={() => editable && setEditingNote(true)}
            className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground ${
              editable ? "cursor-text" : ""
            }`}
          >
            {todo.note}
          </p>
        ) : (
          editable && (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground/0 transition-colors hover:text-muted-foreground group-hover:text-muted-foreground/60"
            >
              <Plus size={12} />
              Ajouter une note
            </button>
          )
        )}

        {showMeta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
            {editable ? (
              <TodoDateControl
                date={todo.scheduled_for}
                overdue={overdue && !isCompleted}
                dimmed={isCompleted}
                onChange={(date) => onUpdate?.({ scheduled_for: date, due_date: date })}
              />
            ) : (
              todo.scheduled_for && (
                <TodoDate
                  date={todo.scheduled_for}
                  dimmed={isCompleted}
                  overdue={overdue && !isCompleted}
                />
              )
            )}

            {editable ? (
              <ListControl
                list={todo.list}
                lists={lists}
                dimmed={isCompleted}
                onChange={(list) => onUpdate?.({ list })}
              />
            ) : (
              todo.list && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Tag size={12} className="opacity-70" />
                  {todo.list}
                </span>
              )
            )}

            {editable ? (
              <RecurrenceControl
                recurrence={todo.recurrence}
                dimmed={isCompleted}
                onChange={(recurrence) => onUpdate?.({ recurrence })}
              />
            ) : (
              todo.recurrence !== "none" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Repeat size={12} className="opacity-70" />
                  {recurrenceLabel(todo.recurrence)}
                </span>
              )
            )}

            {editable ? (
              <ReminderControl
                remindAt={todo.remind_at}
                scheduledFor={todo.scheduled_for}
                dimmed={isCompleted}
                onChange={(remind_at) => onUpdate?.({ remind_at })}
              />
            ) : (
              todo.remind_at && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <BellRing size={12} className="opacity-70" />
                  {reminderLabel(todo.remind_at, todo.scheduled_for)}
                </span>
              )
            )}
          </div>
        )}
      </div>

      <motion.button
        type="button"
        onClick={onDelete}
        whileTap={{ scale: 0.85 }}
        aria-label="Supprimer la tâche"
        className="-mr-1 mt-px shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={15} />
      </motion.button>
    </motion.div>
  );
}
