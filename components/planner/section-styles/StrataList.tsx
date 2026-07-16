"use client";

import { AnimatePresence, motion } from "motion/react";
import { differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { staggerRowVariants } from "@/lib/motion";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { Todo } from "@/features/todos/types";
import type { SectionStyleProps } from "./types";
import { CompactBucket } from "./CompactBucket";

function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayLabel(date: Date, age: number): string {
  if (age === 0) return "Aujourd'hui";
  if (age === 1) return "Hier";
  return capitalize(format(date, "EEEE d MMMM", { locale: fr }));
}

type StrataBucket =
  | { kind: "day"; key: string; date: Date; age: number; todos: Todo[] }
  | { kind: "week"; key: string; label: string; todos: Todo[] }
  | { kind: "month"; key: string; label: string; todos: Todo[] };

/**
 * Regroupe les tâches terminées par jour de complétion (approximé par
 * `updated_at`, faute de champ dédié : la dernière modification d'une tâche
 * terminée EST sa complétion). Au-delà d'une semaine, fusion en semaines,
 * puis en mois — plus l'historique est ancien, plus il se tasse.
 */
function buildStrata(todos: Todo[]): StrataBucket[] {
  const byDate = new Map<string, Todo[]>();
  for (const todo of todos) {
    const dateISO = todo.updated_at.slice(0, 10);
    const arr = byDate.get(dateISO);
    if (arr) arr.push(todo);
    else byDate.set(dateISO, [todo]);
  }

  const today = parseLocalISODate(todayLocalISODate());
  const weekMap = new Map<string, Todo[]>();
  const monthMap = new Map<string, Todo[]>();
  const buckets: StrataBucket[] = [];

  // Plus récent en premier : le dessus de la strate est le plus frais.
  [...byDate.keys()]
    .sort()
    .reverse()
    .forEach((dateISO) => {
      const date = parseLocalISODate(dateISO);
      const age = differenceInCalendarDays(today, date);
      const dayTodos = byDate.get(dateISO)!;
      if (age <= 6) {
        buckets.push({ kind: "day", key: dateISO, date, age, todos: dayTodos });
      } else if (age <= 29) {
        const weekKey = toLocalISODate(startOfWeek(date, { weekStartsOn: 1 }));
        weekMap.set(weekKey, [...(weekMap.get(weekKey) ?? []), ...dayTodos]);
      } else {
        const monthKey = format(date, "yyyy-MM");
        monthMap.set(monthKey, [...(monthMap.get(monthKey) ?? []), ...dayTodos]);
      }
    });

  [...weekMap.keys()]
    .sort()
    .reverse()
    .forEach((key) => {
      const date = parseLocalISODate(key);
      buckets.push({
        kind: "week",
        key,
        label: `Semaine du ${format(date, "d MMMM", { locale: fr })}`,
        todos: weekMap.get(key)!,
      });
    });
  [...monthMap.keys()]
    .sort()
    .reverse()
    .forEach((key) => {
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
 * « Stratigraphie » : les tâches terminées se tassent en strates, de plus en
 * plus fines et estompées avec l'ancienneté. On soulève une strate pour la
 * rouvrir. Les métadonnées sont masquées dans les lignes (le regroupement
 * porte déjà l'information de date).
 */
export function StrataList({ todos, onToggle, onDelete, onUpdate, lists }: SectionStyleProps) {
  const buckets = buildStrata(todos);

  return (
    <div className="flex flex-col">
      <AnimatePresence mode="popLayout">
        {buckets.map((bucket, i) => {
          if (bucket.kind === "day") {
            const opacity = Math.max(0.5, 1 - bucket.age * 0.08);
            const fontSize = Math.max(11, 12.5 - bucket.age * 0.22);
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
                  label={dayLabel(bucket.date, bucket.age)}
                  todos={bucket.todos}
                  headStyle={{ opacity, fontSize }}
                  showDate={false}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  lists={lists}
                />
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
              <CompactBucket
                label={bucket.label}
                todos={bucket.todos}
                headStyle={{ opacity: 0.5, fontSize: 11 }}
                showDate={false}
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
