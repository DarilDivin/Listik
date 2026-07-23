"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { TodoItem } from "@/components/TodoItem";
import { rowVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";

/** Câblage drag & drop d'une liste de tâches. */
export interface TodoListDnd {
  /**
   * Contexte d'ordre manuel (« today », « project:<id> »…) — `null` : les
   * lignes restent des SOURCES de drag (dépôt sur le rail) mais pas des
   * cibles de réordonnancement (sections à tri automatique : En retard…).
   */
  context: string | null;
  onReorder: (draggedId: string, targetId: string, edge: "top" | "bottom") => void;
  /** Une ligne en pause LINGER n'est pas déplaçable (le minuteur la ferait
   *  disparaître en plein geste). */
  canDrag: (id: string) => boolean;
}

/** Donnée transportée par un drag de tâche (lue par les cibles du rail). */
export interface TodoDragData extends Record<string, unknown> {
  type: "todo";
  id: string;
  context: string | null;
}

interface DraggableRowProps {
  todo: Todo;
  dnd: TodoListDnd;
  children: React.ReactNode;
}

/**
 * Enrobe une ligne en source/cible pragmatic-drag-and-drop.
 *
 * AUCUN réordonnancement en vol : pendant le drag, seul un trait indicateur
 * (`--brand`) marque le bord d'insertion — le DOM ne bouge pas, donc la
 * projection `layout` de motion n'a rien à combattre. Au drop, l'état React
 * change et les props `layout` existantes animent le règlement avec les
 * ressorts du design system.
 */
function DraggableRow({ todo, dnd, children }: DraggableRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);

  // Les callbacks lisent la dernière version via ref : l'effet ne dépend que
  // du contexte et de l'id — pas de détachement/rattachement à chaque rendu.
  const dndRef = useRef(dnd);
  dndRef.current = dnd;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleanups = [
      draggable({
        element: el,
        canDrag: () => dndRef.current.canDrag(todo.id),
        getInitialData: (): TodoDragData => ({
          type: "todo",
          id: todo.id,
          context: dndRef.current.context,
        }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
    ];

    if (dnd.context !== null) {
      cleanups.push(
        dropTargetForElements({
          element: el,
          canDrop: ({ source }) =>
            source.data.type === "todo" &&
            source.data.context === dndRef.current.context &&
            source.data.id !== todo.id,
          getData: ({ input, element }) =>
            attachClosestEdge(
              { id: todo.id },
              { input, element, allowedEdges: ["top", "bottom"] },
            ),
          onDrag: ({ self }) => {
            const e = extractClosestEdge(self.data);
            setEdge(e === "top" || e === "bottom" ? e : null);
          },
          onDragLeave: () => setEdge(null),
          onDrop: ({ self, source }) => {
            const e = extractClosestEdge(self.data);
            setEdge(null);
            if (e === "top" || e === "bottom") {
              dndRef.current.onReorder(source.data.id as string, todo.id, e);
            }
          },
        }),
      );
    }

    return combine(...cleanups);
  }, [dnd.context, todo.id]);

  return (
    <div ref={ref} className={cn("relative", dragging && "opacity-40")}>
      {/* Trait d'insertion : posé en absolu, il ne déplace aucun voisin. */}
      {edge && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-brand",
            edge === "top" ? "-top-px" : "-bottom-px",
          )}
        />
      )}
      {children}
    </div>
  );
}

interface AnimatedTodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  showDate?: boolean;
  overdue?: boolean;
  onUpdate?: (id: string, payload: UpdateTodoInput) => void;
  /** Si fourni, les lignes deviennent déplaçables (voir `TodoListDnd`). */
  dnd?: TodoListDnd;
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
  onUpdate,
  dnd,
}: AnimatedTodoListProps) {
  const ids = todos.map((t) => t.id);

  /**
   * Déplacement au clavier Alt+↑/↓ dans un contexte ordonné — quasi gratuit :
   * même `onReorder` que le glisser-déposer. Le nœud focalisé garde le focus à
   * travers l'animation `layout` (le focus suit l'élément, pas la position),
   * donc rien à re-focaliser. L'événement remonte de la div-ligne, dont le
   * gestionnaire laisse passer les combinaisons avec Alt.
   */
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, todoId: string) => {
    if (!dnd?.context || !e.altKey) return;
    const i = ids.indexOf(todoId);
    if (e.key === "ArrowDown" && i < ids.length - 1) {
      e.preventDefault();
      dnd.onReorder(todoId, ids[i + 1], "bottom");
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      dnd.onReorder(todoId, ids[i - 1], "top");
    }
  };

  return (
    <div className="space-y-0.5">
      <AnimatePresence mode="popLayout">
        {todos.map((todo) => {
          const row = (
            <TodoItem
              todo={todo}
              onToggle={() => onToggle(todo.id)}
              onDelete={() => onDelete(todo.id)}
              showDate={showDate}
              overdue={overdue}
              onUpdate={onUpdate ? (payload) => onUpdate(todo.id, payload) : undefined}
            />
          );
          return (
            <motion.div
              key={todo.id}
              layout
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onKeyDown={dnd?.context ? (e) => onListKeyDown(e, todo.id) : undefined}
            >
              {dnd ? (
                <DraggableRow todo={todo} dnd={dnd}>
                  {row}
                </DraggableRow>
              ) : (
                row
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
