"use client";

import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { TodoItem } from "@/components/TodoItem";
import { exitTween, rowVariants, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";

interface CompactBucketProps {
  label: string;
  todos: Todo[];
  dotClassName?: string;
  /** Portée directement sur l'en-tête — sert au dégradé de la stratigraphie. */
  headStyle?: CSSProperties;
  defaultOpen?: boolean;
  showDate?: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, payload: UpdateTodoInput) => void;
}

/**
 * Ligne compactée (un jour / une semaine / un mois condensé en une seule
 * ligne cliquable) qui « éclot » sur place pour révéler ses tâches. Brique
 * partagée par le zoom sémantique et la stratigraphie.
 */
export function CompactBucket({
  label,
  todos,
  dotClassName,
  headStyle,
  defaultOpen = false,
  showDate = true,
  onToggle,
  onDelete,
  onUpdate,
}: CompactBucketProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={headStyle}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/[0.035]"
      >
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dotClassName ?? "bg-muted-foreground/40")}
        />
        <span className="truncate text-[12.5px] font-semibold text-foreground">{label}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/50">
          {todos.length}
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={spring.snappy}
          className="shrink-0 text-muted-foreground/60"
        >
          <ChevronRight size={13} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { height: spring.smooth, opacity: { duration: 0.2, delay: 0.05 } } }}
            exit={{ height: 0, opacity: 0, transition: { height: exitTween, opacity: { duration: 0.12 } } }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 py-1 pl-4">
              <AnimatePresence mode="popLayout">
                {todos.map((todo) => (
                  <motion.div
                    key={todo.id}
                    layout
                    variants={rowVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <TodoItem
                      todo={todo}
                      onToggle={() => onToggle(todo.id)}
                      onDelete={() => onDelete(todo.id)}
                      showDate={showDate}
                      onUpdate={(payload) => onUpdate(todo.id, payload)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
