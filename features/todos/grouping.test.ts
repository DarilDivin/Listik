import { describe, it, expect } from "vitest";
import { groupTodosByDate } from "./grouping";
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
    scheduled_for: partial.scheduled_for ?? null,
    due_date: partial.due_date ?? null,
    created_at: partial.created_at ?? "2026-06-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-06-01T00:00:00.000Z",
  };
}

describe("groupTodosByDate", () => {
  it("range chaque tâche dans le bon horizon", () => {
    const groups = groupTodosByDate(
      [
        todo({ id: "late", scheduled_for: "2026-06-10" }),
        todo({ id: "today", scheduled_for: TODAY }),
        todo({ id: "tom", scheduled_for: TOMORROW }),
        todo({ id: "later", scheduled_for: "2026-06-20" }),
        todo({ id: "none", scheduled_for: null }),
      ],
      TODAY,
      TOMORROW,
    );

    expect(groups.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(groups.today.map((t) => t.id)).toEqual(["today"]);
    expect(groups.tomorrow.map((t) => t.id)).toEqual(["tom"]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["later"]);
    expect(groups.someday.map((t) => t.id)).toEqual(["none"]);
  });

  it("place les tâches terminées dans `completed`, quel que soit leur horizon", () => {
    const groups = groupTodosByDate(
      [todo({ id: "done", scheduled_for: "2026-06-10", status: "completed" })],
      TODAY,
      TOMORROW,
    );

    expect(groups.completed.map((t) => t.id)).toEqual(["done"]);
    expect(groups.overdue).toHaveLength(0);
  });

  it("ignore les tâches annulées", () => {
    const groups = groupTodosByDate(
      [todo({ id: "x", scheduled_for: TODAY, status: "cancelled" })],
      TODAY,
      TOMORROW,
    );

    expect(groups.today).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });
});
