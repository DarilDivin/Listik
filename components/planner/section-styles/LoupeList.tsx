"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useTransform, useMotionValue, type MotionValue } from "motion/react";
import { TodoItem } from "@/components/TodoItem";
import { priorityRingColor } from "@/features/todos/priority";
import { rowVariants, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Todo } from "@/features/todos/types";
import type { SectionStyleProps } from "./types";

/**
 * Hauteur de base LISIBLE : au repos la loupe est une liste compacte (petit
 * titre estompé mais déchiffrable), jamais une colonne de points — un état de
 * repos illisible ressemble à un bug, pas à une mise en forme.
 */
const MIN_H = 24;
const MAX_H = 36;
/** Rayon d'influence en nombre de rangs voisins. */
const RADIUS = 2.6;

/**
 * « La loupe » : tout est visible en filets minuscules, façon minimap. La
 * ligne sous le curseur se dilate jusqu'à devenir lisible, ses voisines
 * suivent en dégradé — comme le Dock de macOS. Cliquer un filet l'« active » :
 * il devient une vraie tâche pleine taille, avec toutes ses commandes.
 */
export function LoupeList({
  todos,
  onToggle,
  onDelete,
  onUpdate,
  lists,
  overdue,
  showDate = true,
}: SectionStyleProps) {
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorIndex = useMotionValue<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rows = containerRef.current?.children;
    if (!rows || rows.length === 0) return;
    const y = e.clientY;
    let idx = 0;
    for (let i = 0; i < rows.length; i++) {
      const rect = (rows[i] as HTMLElement).getBoundingClientRect();
      idx = i;
      if (y <= rect.bottom) break;
    }
    cursorIndex.set(idx);
  };
  const handleMouseLeave = () => cursorIndex.set(null);

  const pin = (id: string) =>
    setPinned((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <AnimatePresence mode="popLayout">
        {todos.map((todo, i) => (
          <motion.div key={todo.id} layout variants={rowVariants} initial="initial" animate="animate" exit="exit">
            {pinned.has(todo.id) ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring.bouncy}
                className="border-t border-border/40 first:border-t-0"
              >
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
            ) : (
              <FilamentRow todo={todo} index={i} cursorIndex={cursorIndex} onActivate={() => pin(todo.id)} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface FilamentRowProps {
  todo: Todo;
  index: number;
  cursorIndex: MotionValue<number | null>;
  onActivate: () => void;
}

/**
 * Dilatation continue pilotée par la position du curseur, sur son propre
 * élément — séparée du montage/démontage (géré par le wrapper `AnimatePresence`
 * du parent) pour ne pas faire concurrence aux mêmes propriétés.
 */
function FilamentRow({ todo, index, cursorIndex, onActivate }: FilamentRowProps) {
  const factor = useTransform(cursorIndex, (c) => {
    if (c === null) return 0;
    const dist = Math.abs(c - index);
    return Math.max(0, 1 - (dist / RADIUS) ** 2);
  });
  const height = useTransform(factor, (f) => MIN_H + (MAX_H - MIN_H) * f);
  const fontSize = useTransform(factor, (f) => 11.5 + f * 2.5);
  // Plancher d'opacité : le titre reste lisible au repos, la loupe l'avive.
  const titleOpacity = useTransform(factor, (f) => 0.55 + f * 0.45);
  const dotOpacity = useTransform(factor, (f) => 1 - f * 0.55);
  const isDone = todo.status === "completed";

  return (
    <motion.button
      type="button"
      onClick={onActivate}
      title="Cliquer pour ouvrir cette tâche"
      style={{ height }}
      className="flex w-full items-center gap-2.5 overflow-hidden border-t border-border/40 px-3 text-left first:border-t-0 hover:bg-foreground/[0.03]"
    >
      <motion.span
        aria-hidden
        style={{
          opacity: dotOpacity,
          borderColor: isDone ? "var(--brand)" : priorityRingColor(todo.priority),
        }}
        className={cn(
          "size-[7px] shrink-0 rounded-full border-2",
          isDone && "bg-brand",
        )}
      />
      <motion.span
        style={{ fontSize, opacity: titleOpacity }}
        className={cn(
          "truncate leading-none text-foreground",
          isDone && "text-muted-foreground line-through",
        )}
      >
        {todo.text}
      </motion.span>
    </motion.button>
  );
}
