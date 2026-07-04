"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePlannerTodos } from "@/hooks/usePlannerTodos";
import { useNotesMutations } from "@/features/notes/useNotesMutations";
import Omnibar from "@/components/Omnibar";
import { AnimatedTodoList } from "@/components/todo/AnimatedTodoList";
import { EmptyState } from "@/components/todo/EmptyState";
import { FilterTabs, type TodoFilter } from "@/components/todo/FilterTabs";
import { ListFilter } from "@/components/todo/ListFilter";
import { PlannerHeader } from "@/components/planner/PlannerHeader";
import {
  TimelineSection,
  type SectionTone,
} from "@/components/planner/TimelineSection";
import { groupTodosByDate } from "@/features/todos/grouping";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { Priority, Todo } from "@/features/todos/types";

interface ActiveSection {
  key: string;
  label: string;
  items: Todo[];
  tone: SectionTone;
  overdue?: boolean;
}

export default function PlannerPage() {
  const {
    todos,
    loading,
    error,
    createTodoFromSmart,
    toggleTodo,
    deleteTodo,
    updateTodo,
    lists,
  } = usePlannerTodos();
  const { createNote } = useNotesMutations();

  const [filter, setFilter] = useState<TodoFilter>("all");
  const [listFilter, setListFilter] = useState<string | null>(null);

  const todayISO = todayLocalISODate();

  // Filtre par liste, puis regroupement temporel.
  const { overdue, today: todayTodos, tomorrow, upcoming, someday, completed } =
    useMemo(() => {
      const visible = listFilter
        ? todos.filter((t) => t.list === listFilter)
        : todos;
      const t = new Date();
      t.setDate(t.getDate() + 1);
      return groupTodosByDate(visible, todayISO, toLocalISODate(t));
    }, [todos, listFilter, todayISO]);

  // Pouls du jour (global, indépendant du filtre liste).
  const { doneToday, totalToday } = useMemo(() => {
    const day = todos.filter((t) => t.scheduled_for === todayISO);
    return {
      doneToday: day.filter((t) => t.status === "completed").length,
      totalToday: day.length,
    };
  }, [todos, todayISO]);

  const activeSections: ActiveSection[] = [
    { key: "overdue", label: "En retard", items: overdue, tone: "danger", overdue: true },
    { key: "today", label: "Aujourd'hui", items: todayTodos, tone: "today" },
    { key: "tomorrow", label: "Demain", items: tomorrow, tone: "default" },
    { key: "upcoming", label: "À venir", items: upcoming, tone: "default" },
    { key: "someday", label: "Sans date", items: someday, tone: "default" },
  ];

  const activeCount = activeSections.reduce((n, s) => n + s.items.length, 0);

  const showActive = filter === "all" || filter === "pending";
  const showCompleted = filter === "all" || filter === "completed";
  const isEmpty =
    (filter === "pending" && activeCount === 0) ||
    (filter === "completed" && completed.length === 0) ||
    (filter === "all" && activeCount === 0 && completed.length === 0);

  const handleCreateTodo = async (taskData: {
    text: string;
    note?: string;
    dueDate?: Date | null;
    priority?: Priority;
    list?: string | null;
  }) => {
    await createTodoFromSmart(taskData);
  };

  const handleCreateNote = async (text: string) => {
    await createNote({ content: text });
    toast.success("Note créée");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Halo d'ambiance (stable, remplit les écrans larges) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[460px]"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -6%, oklch(0.62 0.10 265 / 0.11), transparent 70%)",
        }}
      />

      {/* ───────── Zone défilante : agenda ───────── */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[44rem] px-8">
          <div className="pt-16">
            <PlannerHeader date={today} done={doneToday} total={totalToday} />
          </div>

          {/* Filtres collants en haut de la zone défilante */}
          <div className="sticky top-0 z-10 -mx-8 bg-background/80 px-8 pt-4 pb-3 backdrop-blur-sm">
            <FilterTabs
              value={filter}
              onChange={setFilter}
              counts={{
                all: activeCount + completed.length,
                pending: activeCount,
                completed: completed.length,
              }}
            />
            {lists.length > 0 && (
              <div className="mt-3">
                <ListFilter lists={lists} value={listFilter} onChange={setListFilter} />
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 flex items-center gap-2 text-sm text-destructive">
              <span className="h-1 w-1 rounded-full bg-destructive" />
              {error}
            </div>
          )}

          <div className="space-y-9 pb-10 pt-7">
            {showActive && activeCount > 0 && (
              <div className="relative space-y-9">
                {/* Épine timeline partagée */}
                <span
                  aria-hidden
                  className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-border via-border to-transparent"
                />
                {activeSections.map(
                  (section, i) =>
                    section.items.length > 0 && (
                      <TimelineSection
                        key={section.key}
                        title={section.label}
                        count={section.items.length}
                        tone={section.tone}
                        delay={i * 0.04}
                      >
                        <AnimatedTodoList
                          todos={section.items}
                          onToggle={toggleTodo}
                          onDelete={deleteTodo}
                          showDate
                          overdue={section.overdue}
                          lists={lists}
                          onUpdate={updateTodo}
                        />
                      </TimelineSection>
                    ),
                )}
              </div>
            )}

            {showCompleted && completed.length > 0 && (
              <section className="relative space-y-2 pl-7">
                <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
                  Terminées
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/40">
                    {completed.length}
                  </span>
                </h3>
                <AnimatedTodoList
                  todos={completed}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  showDate
                  lists={lists}
                  onUpdate={updateTodo}
                />
              </section>
            )}

            {isEmpty && (
              <EmptyState
                title={
                  filter === "pending"
                    ? "Aucune tâche en cours"
                    : filter === "completed"
                      ? "Aucune tâche terminée"
                      : "Aucune tâche planifiée"
                }
                subtitle="Capturez votre première tâche ci-dessous."
              />
            )}
          </div>
        </div>
      </div>

      {/* ───────── Capture épinglée en bas ───────── */}
      <div className="relative z-10 shrink-0 bg-background/90 backdrop-blur-sm">
        {/* Fondu doux au-dessus de la capture (au lieu d'un trait) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto max-w-[44rem] px-8 py-4">
          <Omnibar
            defaultMode="task"
            onSubmit={handleCreateTodo}
            onSubmitNote={handleCreateNote}
            placeholder="Capturer une tâche…"
            lists={lists}
          />
        </div>
      </div>
    </div>
  );
}
