"use client";

import { AnimatePresence, motion } from "motion/react";
import { differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { TodoItem } from "@/components/TodoItem";
import { rowVariants, staggerRowVariants } from "@/lib/motion";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { Todo } from "@/features/todos/types";
import type { SectionStyleProps } from "./types";
import { CompactBucket } from "./CompactBucket";

/** Parse une date « jour seul » en Date locale (évite le décalage UTC). */
function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type ZoomBucket =
  | { kind: "day-full"; key: string; date: Date; todos: Todo[] }
  | { kind: "day-compact"; key: string; date: Date; todos: Todo[] }
  | { kind: "week"; key: string; label: string; todos: Todo[] }
  | { kind: "month"; key: string; label: string; todos: Todo[] };

/**
 * Regroupe les tâches par distance temporelle : les prochains jours en détail,
 * le reste de la semaine en une ligne par jour, au-delà en semaines puis en
 * mois. Chaque tâche a une `scheduled_for` (garanti par le groupe « À venir »).
 */
function buildBuckets(todos: Todo[]): ZoomBucket[] {
  const byDate = new Map<string, Todo[]>();
  for (const todo of todos) {
    const date = todo.scheduled_for;
    if (!date) continue;
    const arr = byDate.get(date);
    if (arr) arr.push(todo);
    else byDate.set(date, [todo]);
  }

  const today = parseLocalISODate(todayLocalISODate());
  const weekMap = new Map<string, Todo[]>();
  const monthMap = new Map<string, Todo[]>();
  const buckets: ZoomBucket[] = [];

  [...byDate.keys()].sort().forEach((dateISO) => {
    const date = parseLocalISODate(dateISO);
    const dist = differenceInCalendarDays(date, today);
    const dayTodos = byDate.get(dateISO)!;
    if (dist <= 3) {
      buckets.push({ kind: "day-full", key: dateISO, date, todos: dayTodos });
    } else if (dist <= 7) {
      buckets.push({ kind: "day-compact", key: dateISO, date, todos: dayTodos });
    } else if (dist <= 30) {
      const weekKey = toLocalISODate(startOfWeek(date, { weekStartsOn: 1 }));
      weekMap.set(weekKey, [...(weekMap.get(weekKey) ?? []), ...dayTodos]);
    } else {
      const monthKey = format(date, "yyyy-MM");
      monthMap.set(monthKey, [...(monthMap.get(monthKey) ?? []), ...dayTodos]);
    }
  });

  [...weekMap.keys()].sort().forEach((key) => {
    const date = parseLocalISODate(key);
    buckets.push({
      kind: "week",
      key,
      label: `Semaine du ${format(date, "d MMMM", { locale: fr })}`,
      todos: weekMap.get(key)!,
    });
  });
  [...monthMap.keys()].sort().forEach((key) => {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    buckets.push({
      kind: "month",
      key,
      label: capitalize(format(date, "MMMM yyyy", { locale: fr })),
      todos: monthMap.get(key)!,
    });
  });

  return buckets;
}

/**
 * « Zoom sémantique » : la distance dans le temps devient un niveau de
 * détail — les prochains jours sont détaillés, la semaine suivante se
 * compacte en une ligne par jour, au-delà en semaines puis en mois.
 */
export function ZoomList({ todos, onToggle, onDelete, onUpdate, lists }: SectionStyleProps) {
  const buckets = buildBuckets(todos);

  return (
    <div className="flex flex-col">
      <AnimatePresence mode="popLayout">
        {buckets.map((bucket, i) => {
          if (bucket.kind === "day-full") {
            return (
              <motion.div
                key={bucket.key}
                layout="position"
                custom={i}
                variants={staggerRowVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="border-t border-border/60 pb-1 pt-2 first:border-t-0"
              >
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
                  {capitalize(format(bucket.date, "EEEE d MMMM", { locale: fr }))}
                </p>
                <div className="space-y-0.5">
                  <AnimatePresence mode="popLayout">
                    {bucket.todos.map((todo) => (
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
                          lists={lists}
                          onUpdate={(payload) => onUpdate(todo.id, payload)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          }

          const label =
            bucket.kind === "day-compact"
              ? capitalize(format(bucket.date, "EEEE d MMMM", { locale: fr }))
              : bucket.label;

          return (
            <motion.div
              key={bucket.key}
              layout="position"
              custom={i}
              variants={staggerRowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <CompactBucket
                label={label}
                todos={bucket.todos}
                dotClassName={bucket.kind === "day-compact" ? undefined : "bg-brand/60"}
                onToggle={onToggle}
                onDelete={onDelete}
                onUpdate={onUpdate}
                lists={lists}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
