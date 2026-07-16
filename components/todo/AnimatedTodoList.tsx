"use client";

import { AnimatePresence, motion } from "motion/react";
import { TodoItem } from "@/components/TodoItem";
import { rowVariants } from "@/lib/motion";
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
 * `mode="popLayout"` retire l'élément sortant du flux dès le début de sa
 * sortie : ses voisins se referment aussitôt en ressort (`layout`) au lieu
 * d'attendre la fin du fondu — c'est le geste le plus répété de l'app
 * (terminer/supprimer une tâche), il mérite ce soin.
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
      <AnimatePresence mode="popLayout">
        {todos.map((todo) => (
          <motion.div key={todo.id} layout variants={rowVariants} initial="initial" animate="animate" exit="exit">
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
