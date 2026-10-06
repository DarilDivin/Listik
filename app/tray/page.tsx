"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { motion } from "motion/react";
import {
  ArrowUpRight01Icon,
  Logout03Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { AppIcon } from "@/components/ui/app-icon";
import { APP_NAVIGATE_EVENT } from "@/components/app-nav";
import { ListikLogotype } from "@/components/brand/ListikLogo";
import { QUICK_ITEMS, type QuickMode } from "@/components/QuickPills";
import { TodoCheckbox } from "@/components/todo/TodoCheckbox";
import { todosApi } from "@/features/todos/api";
import { groupTodosByDate } from "@/features/todos/grouping";
import { sortTodos } from "@/features/todos/sort";
import type { Todo } from "@/features/todos/types";
import { restorePayloadForToggle } from "@/features/todos/undo";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { deadlineCountdown, todayLocalISODate, toLocalISODate } from "@/lib/date";
import { SWR_KEYS } from "@/lib/swr-config";
import { cn } from "@/lib/utils";

/** Au-delà, le panneau renvoie vers l'app plutôt que de s'allonger. */
const MAX_ROWS = 6;
/** Le retard ne mange pas la journée : au plus 3 lignes s'il en reste pour elle. */
const MAX_LATE = 3;

interface Row {
  todo: Todo;
  checked: boolean;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Le panneau du tray (fenêtre `tray`, ouverte au clic gauche sur l'icône) :
 * la journée d'un coup d'œil — les tâches d'aujourd'hui à cocher — puis la
 * capture rapide dans ses trois modes, et l'app. Il se ferme dès qu'il perd
 * le focus (géré côté Rust) ou sur Échap.
 *
 * Une tâche cochée ici reste à sa place, cochée, jusqu'à la fermeture : on
 * peut se raviser sans la chercher. Décocher restaure l'état d'avant (une
 * récurrente reportée revient à sa date, elle n'avance pas une seconde fois).
 */
export default function TrayPanel() {
  useTodosSync();
  const { data: rawTodos = [], mutate } = useSWR(SWR_KEYS.ALL_TODOS, () => todosApi.list());

  // Tâches cochées depuis l'ouverture : id → état d'AVANT le basculement.
  const [lingering, setLingering] = useState<ReadonlyMap<string, Todo>>(new Map());
  // Place de chaque tâche depuis l'ouverture (rang + section) : une tâche
  // cochée ne saute ni de rang ni de section.
  const placed = useRef(new Map<string, { index: number; late: boolean }>());
  const [today, setToday] = useState(todayLocalISODate);

  const rootRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const groups = groupTodosByDate(sortTodos(rawTodos), today, toLocalISODate(tomorrow));
    const lateIds = new Set(groups.overdue.map((t) => t.id));
    const live: Row[] = [...groups.overdue, ...groups.today, ...groups.routines, ...groups.evening]
      .filter((t) => !lingering.has(t.id))
      .map((todo) => ({ todo, checked: false }));
    const done: Row[] = [...lingering.values()].map((todo) => ({ todo, checked: true }));

    const all = [...live, ...done];
    for (const { todo } of all) {
      if (!placed.current.has(todo.id)) {
        placed.current.set(todo.id, { index: placed.current.size, late: lateIds.has(todo.id) });
      }
    }
    const place = (row: Row) => placed.current.get(row.todo.id)!;
    all.sort((a, b) => place(a).index - place(b).index);
    return { late: all.filter((r) => place(r).late), onDay: all.filter((r) => !place(r).late) };
  }, [rawTodos, today, lingering]);

  // Le pouls du jour, comme le planner : ce qui était prévu aujourd'hui. Une
  // récurrente cochée ici est déjà reportée à sa prochaine date : elle compte
  // quand même comme faite aujourd'hui.
  const dayTodos = rawTodos.filter((t) => t.scheduled_for === today && t.status !== "cancelled");
  const dayIds = new Set(dayTodos.map((t) => t.id));
  const movedOn = [...lingering.values()].filter(
    (t) => t.scheduled_for === today && !dayIds.has(t.id),
  ).length;
  const dayCount = dayTodos.length + movedOn;
  const dayDone = dayTodos.filter((t) => t.status === "completed").length + movedOn;
  const progress = dayCount ? dayDone / dayCount : 0;

  const shownLate = rows.late.slice(0, Math.max(MAX_LATE, MAX_ROWS - rows.onDay.length));
  const shownDay = rows.onDay.slice(0, MAX_ROWS - shownLate.length);
  const hidden = rows.late.length + rows.onDay.length - shownLate.length - shownDay.length;

  // Fermé : on repart d'une ardoise propre pour la prochaine ouverture.
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setToday(todayLocalISODate());
        return;
      }
      setLingering(new Map());
      placed.current.clear();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // La fenêtre épouse le contenu ; Rust la replace contre l'icône.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => {
      void invoke("resize_tray_panel", { height: Math.ceil(root.getBoundingClientRect().height) });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const toggle = useCallback(
    async (todo: Todo, checked: boolean) => {
      const before = lingering.get(todo.id);
      try {
        if (checked && before) {
          setLingering((map) => {
            const next = new Map(map);
            next.delete(todo.id);
            return next;
          });
          await todosApi.update(todo.id, restorePayloadForToggle(before));
        } else {
          setLingering((map) => new Map(map).set(todo.id, todo));
          await todosApi.toggle(todo.id);
        }
      } catch (error) {
        console.error("Panneau du tray : bascule impossible", error);
        setLingering((map) => {
          const next = new Map(map);
          if (before) next.set(todo.id, before);
          else next.delete(todo.id);
          return next;
        });
      }
      void mutate();
    },
    [lingering, mutate],
  );

  const close = () => void getCurrentWindow().hide();

  const openApp = async (path?: string) => {
    if (path) await emit(APP_NAVIGATE_EVENT, path);
    await invoke("show_main_window");
    close();
  };

  const capture = async (mode: Exclude<QuickMode, "neutre">) => {
    await invoke("open_quick_window", { mode });
    close();
  };

  return (
    <div ref={rootRef} className="flex select-none flex-col px-1.5 pb-1.5 text-[13px]">
      <header className="flex items-baseline justify-between gap-3 px-3 pt-3.5 pb-3">
        <ListikLogotype className="h-[15px] w-auto self-center text-foreground" />
        <span className="truncate text-xs text-muted-foreground first-letter:uppercase">
          {dayFormat.format(new Date(`${today}T12:00:00`))}
        </span>
      </header>

      {/* La hairline sous l'en-tête se remplit au fil de la journée. */}
      <div className="relative mx-3 h-px bg-border/60">
        <motion.div
          className="absolute inset-y-0 left-0 bg-brand"
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <section className="pt-2 pb-1.5" aria-label="Aujourd'hui">
        {shownLate.length > 0 && (
          <>
            <SectionLabel label="En retard" late onClick={() => void openApp("/")} />
            <ul className="mb-1.5">
              {shownLate.map(({ todo, checked }) => (
                <TaskRow
                  key={todo.id}
                  todo={todo}
                  checked={checked}
                  today={today}
                  onToggle={() => void toggle(todo, checked)}
                  onOpen={() => void openApp("/")}
                />
              ))}
            </ul>
          </>
        )}

        <SectionLabel
          label="Aujourd'hui"
          count={dayCount > 0 ? `${dayDone} / ${dayCount}` : undefined}
          onClick={() => void openApp("/")}
        />
        {shownDay.length === 0 ? (
          <p className="px-3 pt-0.5 pb-2 text-muted-foreground">
            {dayCount > 0 ? "Tout est fait pour aujourd’hui." : "Rien de prévu aujourd’hui."}
          </p>
        ) : (
          <ul>
            {shownDay.map(({ todo, checked }) => (
              <TaskRow
                key={todo.id}
                todo={todo}
                checked={checked}
                today={today}
                onToggle={() => void toggle(todo, checked)}
                onOpen={() => void openApp("/")}
              />
            ))}
          </ul>
        )}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => void openApp("/")}
            className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {hidden === 1 ? "Encore une tâche" : `Encore ${hidden} tâches`} dans Listik
          </button>
        )}
      </section>

      <div className="mx-3 border-t border-border/60" />

      <div className="grid grid-cols-3 gap-1 py-1.5" role="group" aria-label="Capture rapide">
        {QUICK_ITEMS.map((item) => (
          <button
            key={item.mode}
            type="button"
            onClick={() => void capture(item.mode)}
            className="group flex flex-col items-center gap-1.5 rounded-xl px-2 pt-2.5 pb-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand">
              <AppIcon icon={item.icon} size={17} />
            </span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="mx-3 border-t border-border/60" />

      <nav className="flex flex-col pt-1.5">
        <MenuRow icon={ArrowUpRight01Icon} label="Ouvrir Listik" onClick={() => void openApp()} />
        <MenuRow icon={Settings02Icon} label="Réglages" onClick={() => void openApp("/settings")} />
        <MenuRow icon={Logout03Icon} label="Quitter" onClick={() => void exit(0)} />
      </nav>
    </div>
  );
}

function SectionLabel({
  label,
  count,
  late = false,
  onClick,
}: {
  label: string;
  count?: string;
  late?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        late
          ? "text-destructive/80 hover:text-destructive"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {count && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

function TaskRow({
  todo,
  checked,
  today,
  onToggle,
  onOpen,
}: {
  todo: Todo;
  checked: boolean;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  // Comme la ligne du planner : le compte à rebours dès que l'échéance est
  // atteinte (le retard sans échéance, lui, est dit par la section).
  const deadline = todo.due_date ? deadlineCountdown(todo.due_date, today) : null;
  const badge = !checked && deadline?.reached ? deadline.label : null;

  return (
    <li className="flex items-center gap-2.5 rounded-lg px-3 py-[7px] transition-colors hover:bg-accent/60">
      <TodoCheckbox checked={checked} onToggle={onToggle} priority={todo.priority} />
      <button
        type="button"
        onClick={onOpen}
        title={todo.text}
        className={cn(
          "min-w-0 flex-1 truncate text-left transition-colors",
          checked ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground",
        )}
      >
        {todo.text}
      </button>
      {badge && <span className="shrink-0 text-[11px] tabular-nums text-destructive">{badge}</span>}
    </li>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-foreground/85 transition-colors hover:bg-accent hover:text-foreground"
    >
      <AppIcon icon={icon} size={16} className="text-muted-foreground" />
      {label}
    </button>
  );
}
