"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { TodoItem } from "@/components/TodoItem";
import { rowVariants, spring, staggerRowVariants } from "@/lib/motion";
import type { Todo, UpdateTodoInput } from "@/features/todos/types";
import type { SectionStyleProps } from "./types";

const FULL_COUNT = 4;
/**
 * Hauteur minimale d'un rang comprimé : assez pour laisser voir la case ET le
 * début du titre — un filet de quelques pixels ne montre que des ronds et se
 * lit comme un affichage cassé, pas comme une compression.
 */
const MIN_HEIGHT = 26;

/**
 * « L'horizon » : au-delà de quelques tâches, la liste fuit vers le bas —
 * hauteur et opacité qui diminuent avec la profondeur, jusqu'à devenir des
 * filets. La poignée en bas se glisse (ou se clique) pour tout déplier.
 */
export function HorizonList({
  todos,
  onToggle,
  onDelete,
  onUpdate,
  lists,
  overdue,
  showDate = true,
}: SectionStyleProps) {
  const reveal = useMotionValue(0);
  const dragRef = useRef({ dragging: false, startY: 0, startReveal: 0 });

  // Peu de tâches : la compression n'apporterait rien, on reste sur la liste simple.
  if (todos.length <= FULL_COUNT + 2) {
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
                onUpdate={(payload) => onUpdate(todo.id, payload)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  const full = todos.slice(0, FULL_COUNT);
  const compressed = todos.slice(FULL_COUNT);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { dragging: true, startY: e.clientY, startReveal: reveal.get() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const dy = e.clientY - dragRef.current.startY;
    reveal.set(Math.min(1, Math.max(0, dragRef.current.startReveal + dy / 110)));
  };
  const onPointerUp = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    animate(reveal, reveal.get() > 0.3 ? 1 : 0, spring.smooth);
  };
  const onHandleClick = () => {
    animate(reveal, reveal.get() > 0.5 ? 0 : 1, spring.smooth);
  };

  return (
    <div>
      <div className="space-y-0.5">
        <AnimatePresence mode="popLayout">
          {full.map((todo) => (
            <motion.div key={todo.id} layout variants={rowVariants} initial="initial" animate="animate" exit="exit">
              <TodoItem
                todo={todo}
                onToggle={() => onToggle(todo.id)}
                onDelete={() => onDelete(todo.id)}
                showDate={showDate}
                overdue={overdue}
                lists={lists}
                onUpdate={(payload) => onUpdate(todo.id, payload)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div>
        <AnimatePresence mode="popLayout">
          {compressed.map((todo, i) => (
            <motion.div
              key={todo.id}
              layout="position"
              custom={i}
              variants={staggerRowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <HorizonRow
                todo={todo}
                depth={(i + 1) / compressed.length}
                reveal={reveal}
                onToggle={() => onToggle(todo.id)}
                onDelete={() => onDelete(todo.id)}
                onUpdate={(payload) => onUpdate(todo.id, payload)}
                lists={lists}
                overdue={overdue}
                showDate={showDate}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onHandleClick}
        whileTap={{ scale: 0.92 }}
        role="slider"
        tabIndex={0}
        aria-label="Déplier les tâches compressées"
        aria-valuenow={Math.round(reveal.get() * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="flex h-5 touch-none items-center justify-center pt-2 [cursor:ns-resize]"
      >
        <motion.span
          whileHover={{ scaleX: 1.25, backgroundColor: "var(--muted-foreground)" }}
          transition={spring.snappy}
          className="h-[3px] w-10 rounded-full bg-border"
        />
      </motion.div>
    </div>
  );
}

interface HorizonRowProps {
  todo: Todo;
  /** 0 = juste après les tâches pleines, 1 = la plus profonde. */
  depth: number;
  reveal: MotionValue<number>;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (payload: UpdateTodoInput) => void;
  lists: string[];
  overdue?: boolean;
  showDate?: boolean;
}

/**
 * Compression continue (hauteur/opacité/scale pilotées par `reveal`), sur son
 * propre `motion.div` — séparée du montage/démontage (géré par le wrapper
 * `AnimatePresence` du parent) pour ne pas faire concurrence aux mêmes
 * propriétés lors d'une suppression.
 */
function HorizonRow({ todo, depth, reveal, onToggle, onDelete, onUpdate, lists, overdue, showDate = true }: HorizonRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  // Mesure avant peinture : évite tout flash « pleine taille » au montage.
  useLayoutEffect(() => {
    if (ref.current) setNaturalHeight(ref.current.scrollHeight);
  }, []);

  const openness = useTransform(reveal, (r) => Math.max(0, 1 - depth * 0.92 * (1 - r)));
  const height = useTransform(openness, (t) =>
    naturalHeight === null ? "auto" : MIN_HEIGHT + (naturalHeight - MIN_HEIGHT) * t,
  );
  const opacity = useTransform(openness, (t) => 0.35 + t * 0.65);
  const scale = useTransform(openness, (t) => 0.94 + t * 0.06);

  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      <motion.div style={{ height, opacity, scale, transformOrigin: "top left" }}>
        <TodoItem
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
          showDate={showDate}
          overdue={overdue}
          lists={lists}
          onUpdate={onUpdate}
        />
      </motion.div>
    </div>
  );
}
