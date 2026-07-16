import { describe, it, expect } from "vitest";
import { countForView, groupTodosByDate } from "./grouping";
import type { Todo } from "./types";

const TODAY = "2026-06-14";
const TOMORROW = "2026-06-15";

function todo(partial: Partial<Todo> & { id: string }): Todo {
  return {
    id: partial.id,
    text: partial.text ?? "Tâche",
    note: partial.note ?? null,
    list: partial.list ?? null,
    status: partial.status ?? "pending",
    priority: partial.priority ?? "normal",
    recurrence: partial.recurrence ?? "none",
    scheduled_for: partial.scheduled_for ?? null,
    due_date: partial.due_date ?? null,
    remind_at: partial.remind_at ?? null,
    project_id: partial.project_id ?? null,
    heading_id: partial.heading_id ?? null,
    this_evening: partial.this_evening ?? false,
    someday: partial.someday ?? false,
    created_at: partial.created_at ?? "2026-06-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-06-01T00:00:00.000Z",
    sub_tasks: partial.sub_tasks ?? [],
  };
}

const group = (todos: Todo[]) => groupTodosByDate(todos, TODAY, TOMORROW);

describe("groupTodosByDate", () => {
  it("range chaque tâche dans le bon horizon daté", () => {
    const groups = group([
      todo({ id: "late", scheduled_for: "2026-06-10" }),
      todo({ id: "today", scheduled_for: TODAY }),
      todo({ id: "tom", scheduled_for: TOMORROW }),
      todo({ id: "later", scheduled_for: "2026-06-20" }),
    ]);

    expect(groups.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(groups.today.map((t) => t.id)).toEqual(["today"]);
    expect(groups.tomorrow.map((t) => t.id)).toEqual(["tom"]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["later"]);
  });

  it("place les tâches terminées dans `completed`, quel que soit leur horizon", () => {
    const groups = group([
      todo({ id: "done", scheduled_for: "2026-06-10", status: "completed" }),
    ]);

    expect(groups.completed.map((t) => t.id)).toEqual(["done"]);
    expect(groups.overdue).toHaveLength(0);
  });

  it("ignore les tâches annulées", () => {
    const groups = group([
      todo({ id: "x", scheduled_for: TODAY, status: "cancelled" }),
    ]);

    expect(groups.today).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });

  // --- Dérivation GTD (Phase F) ---

  it("sans date ni rattachement → boîte de réception ; avec rattachement → quand je peux", () => {
    const groups = group([
      todo({ id: "brut" }),
      todo({ id: "projet", project_id: "p1" }),
      // Pont transitoire : la liste plate vaut rattachement jusqu'à la Phase G.
      todo({ id: "liste", list: "Courses" }),
    ]);

    expect(groups.inbox.map((t) => t.id)).toEqual(["brut"]);
    expect(groups.anytime.map((t) => t.id)).toEqual(["projet", "liste"]);
  });

  it("« Un jour » prime sur tout horizon daté", () => {
    const groups = group([
      todo({ id: "un-jour", someday: true }),
      todo({ id: "un-jour-date", someday: true, scheduled_for: TODAY }),
    ]);

    expect(groups.someday.map((t) => t.id)).toEqual(["un-jour", "un-jour-date"]);
    expect(groups.today).toHaveLength(0);
    expect(groups.inbox).toHaveLength(0);
  });

  it("« Ce soir » ne s'applique qu'à la journée en cours", () => {
    const groups = group([
      todo({ id: "soir", scheduled_for: TODAY, this_evening: true }),
      todo({ id: "jour", scheduled_for: TODAY }),
      // Marquée « ce soir » mais planifiée demain → reste dans Demain.
      todo({ id: "demain-soir", scheduled_for: TOMORROW, this_evening: true }),
    ]);

    expect(groups.evening.map((t) => t.id)).toEqual(["soir"]);
    expect(groups.today.map((t) => t.id)).toEqual(["jour"]);
    expect(groups.tomorrow.map((t) => t.id)).toEqual(["demain-soir"]);
  });

  it("une tâche quitte la boîte de réception dès qu'on la planifie", () => {
    const captured = todo({ id: "a" });
    expect(group([captured]).inbox).toHaveLength(1);

    const scheduled = { ...captured, scheduled_for: TODAY };
    expect(group([scheduled]).inbox).toHaveLength(0);
    expect(group([scheduled]).today.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("countForView", () => {
  it("additionne les groupes d'une vue (Aujourd'hui = retard + jour + soir)", () => {
    const groups = group([
      todo({ id: "late", scheduled_for: "2026-06-10" }),
      todo({ id: "today", scheduled_for: TODAY }),
      todo({ id: "soir", scheduled_for: TODAY, this_evening: true }),
      todo({ id: "brut" }),
    ]);

    expect(countForView(groups, "today")).toBe(3);
    expect(countForView(groups, "inbox")).toBe(1);
    expect(countForView(groups, "journal")).toBe(0);
  });
});
