"use client";

import { AnimatePresence, motion } from "motion/react";
import { differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { TodoItem } from "@/components/TodoItem";
import { rowVariants, staggerRowVariants } from "@/lib/motion";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { Todo } from "@/features/todos/types";
import type { GhostOccurrence } from "@/features/todos/recurrence";
import type { SectionStyleProps } from "./types";
import { CompactBucket } from "./CompactBucket";
import { GhostRow } from "./GhostRow";

/** Parse une date « jour seul » en Date locale (évite le décalage UTC). */
function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type ZoomBucket =
  | { kind: "day-full"; key: string; date: Date; todos: Todo[]; ghosts: GhostOccurrence[] }
  | { kind: "day-compact"; key: string; date: Date; todos: Todo[]; ghosts: GhostOccurrence[] }
  | { kind: "week"; key: string; label: string; todos: Todo[]; ghosts: GhostOccurrence[] }
  | { kind: "month"; key: string; label: string; todos: Todo[]; ghosts: GhostOccurrence[] };

/**
 * Regroupe les tâches par distance temporelle : les prochains jours en détail,
 * le reste de la semaine en une ligne par jour, au-delà en semaines puis en
 * mois. Chaque tâche a une `scheduled_for` (garanti par le groupe « À venir »).
 *
 * Les fantômes (occurrences projetées, phase M) rejoignent l'union des jours
 * à traiter à CHAQUE niveau de zoom, jusqu'à l'horizon de calcul complet
 * (~90 jours) : une récurrence hebdomadaire doit apparaître à J+7, J+14,
 * J+21… jusque dans les compartiments semaine/mois, pas seulement les tout
 * premiers jours — sinon une habitude récurrente semblerait s'arrêter dans
 * un calendrier qui se veut justement « À venir ».
 */
function buildBuckets(todos: Todo[], ghosts: GhostOccurrence[]): ZoomBucket[] {
  const byDate = new Map<string, Todo[]>();
  for (const todo of todos) {
    const date = todo.scheduled_for;
    if (!date) continue;
    const arr = byDate.get(date);
    if (arr) arr.push(todo);
    else byDate.set(date, [todo]);
  }

  const ghostsByDate = new Map<string, GhostOccurrence[]>();
  for (const ghost of ghosts) {
    const arr = ghostsByDate.get(ghost.date);
    if (arr) arr.push(ghost);
    else ghostsByDate.set(ghost.date, [ghost]);
  }

  const today = parseLocalISODate(todayLocalISODate());
  const weekTodos = new Map<string, Todo[]>();
  const weekGhosts = new Map<string, GhostOccurrence[]>();
  const monthTodos = new Map<string, Todo[]>();
  const monthGhosts = new Map<string, GhostOccurrence[]>();
  const buckets: ZoomBucket[] = [];

  const dayKeys = new Set([...byDate.keys(), ...ghostsByDate.keys()]);

  [...dayKeys].sort().forEach((dateISO) => {
    const date = parseLocalISODate(dateISO);
    const dist = differenceInCalendarDays(date, today);
    const dayTodos = byDate.get(dateISO) ?? [];
    const dayGhosts = ghostsByDate.get(dateISO) ?? [];
    if (dist <= 3) {
      buckets.push({ kind: "day-full", key: dateISO, date, todos: dayTodos, ghosts: dayGhosts });
    } else if (dist <= 7) {
      buckets.push({ kind: "day-compact", key: dateISO, date, todos: dayTodos, ghosts: dayGhosts });
    } else if (dist <= 30) {
      const weekKey = toLocalISODate(startOfWeek(date, { weekStartsOn: 1 }));
      if (dayTodos.length > 0) weekTodos.set(weekKey, [...(weekTodos.get(weekKey) ?? []), ...dayTodos]);
      if (dayGhosts.length > 0) weekGhosts.set(weekKey, [...(weekGhosts.get(weekKey) ?? []), ...dayGhosts]);
    } else {
      const monthKey = format(date, "yyyy-MM");
      if (dayTodos.length > 0) monthTodos.set(monthKey, [...(monthTodos.get(monthKey) ?? []), ...dayTodos]);
      if (dayGhosts.length > 0) monthGhosts.set(monthKey, [...(monthGhosts.get(monthKey) ?? []), ...dayGhosts]);
    }
  });

  const weekKeys = new Set([...weekTodos.keys(), ...weekGhosts.keys()]);
  [...weekKeys].sort().forEach((key) => {
    const date = parseLocalISODate(key);
    buckets.push({
      kind: "week",
      key,
      label: `Semaine du ${format(date, "d MMMM", { locale: fr })}`,
      todos: weekTodos.get(key) ?? [],
      ghosts: weekGhosts.get(key) ?? [],
    });
  });
  const monthKeys = new Set([...monthTodos.keys(), ...monthGhosts.keys()]);
  [...monthKeys].sort().forEach((key) => {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    buckets.push({
      kind: "month",
      key,
      label: capitalize(format(date, "MMMM yyyy", { locale: fr })),
      todos: monthTodos.get(key) ?? [],
      ghosts: monthGhosts.get(key) ?? [],
    });
  });

  return buckets;
}

/**
 * « Zoom sémantique » : la distance dans le temps devient un niveau de
 * détail — les prochains jours sont détaillés, la semaine suivante se
 * compacte en une ligne par jour, au-delà en semaines puis en mois.
 */
export function ZoomList({ todos, onToggle, onDelete, onUpdate, ghosts = [] }: SectionStyleProps) {
  const buckets = buildBuckets(todos, ghosts);

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
                {bucket.todos.length > 0 && (
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
                            onUpdate={(payload) => onUpdate(todo.id, payload)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {bucket.ghosts.length > 0 && (
                  <div>
                    {bucket.ghosts.map((ghost) => (
                      <GhostRow key={ghost.key} text={ghost.text} recurrenceLabel={ghost.recurrenceLabel} />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          }

          if (bucket.kind === "day-compact") {
            const label = capitalize(format(bucket.date, "EEEE d MMMM", { locale: fr }));
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
                {bucket.todos.length > 0 && (
                  <CompactBucket
                    label={label}
                    todos={bucket.todos}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                  />
                )}
                {bucket.ghosts.length > 0 && (
                  <div className={bucket.todos.length > 0 ? "pl-4" : "border-t border-border/60"}>
                    {bucket.todos.length === 0 && (
                      <p className="px-3 pt-2 text-[12.5px] font-semibold text-foreground">{label}</p>
                    )}
                    {bucket.ghosts.map((ghost) => (
                      <GhostRow key={ghost.key} text={ghost.text} recurrenceLabel={ghost.recurrenceLabel} />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          }

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
              {bucket.todos.length > 0 && (
                <CompactBucket
                  label={bucket.label}
                  todos={bucket.todos}
                  dotClassName="bg-brand/60"
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                />
              )}
              {bucket.ghosts.length > 0 && (
                <div className={bucket.todos.length > 0 ? "pl-4" : "border-t border-border/60"}>
                  {bucket.todos.length === 0 && (
                    <p className="px-3 pt-2 text-[12.5px] font-semibold text-foreground">
                      {bucket.label}
                    </p>
                  )}
                  {bucket.ghosts.map((ghost) => (
                    <GhostRow key={ghost.key} text={ghost.text} recurrenceLabel={ghost.recurrenceLabel} />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
