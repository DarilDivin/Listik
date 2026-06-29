"use client";

import { AnimatePresence, motion } from "motion/react";
import { TodoItem } from "@/components/TodoItem";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";

interface AnimatedTodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  showDate?: boolean;
  overdue?: boolean;
  lists?: string[];
  onUpdate?: (id: string, payload: UpdateTodoInput) => void;
}

/**
 * Liste de tâches animée (entrée/sortie + réordonnancement `layout`).
 * Les `motion.div` sont enfants directs de `AnimatePresence` pour que les
 * animations de sortie fonctionnent réellement.
 */
export function AnimatedTodoList({
  todos,
  onToggle,
  onDelete,
  showDate = false,
  overdue = false,
  lists = [],
  onUpdate,
}: AnimatedTodoListProps) {
  return (
    <div className="space-y-0.5">
      <AnimatePresence mode="sync">
        {todos.map((todo) => (
          <motion.div
            key={todo.id}
            layout
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{
              layout: { type: "spring", bounce: 0.16, duration: 0.5 },
              default: { type: "spring", bounce: 0.18, duration: 0.45 },
            }}
          >
            <TodoItem
              todo={todo}
              onToggle={() => onToggle(todo.id)}
              onDelete={() => onDelete(todo.id)}
              showDate={showDate}
              overdue={overdue}
              lists={lists}
              onUpdate={onUpdate ? (payload) => onUpdate(todo.id, payload) : undefined}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
