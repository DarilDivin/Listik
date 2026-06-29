import { describe, it, expect } from "vitest";
import { sortTodos } from "./sort";
import type { Todo } from "./types";

let counter = 0;
function makeTodo(partial: Partial<Todo>): Todo {
  counter += 1;
  return {
    id: `id-${counter}`,
    text: "",
    note: null,
    status: "pending",
    priority: "normal",
    scheduled_for: null,
    due_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("sortTodos", () => {
  it("place les tâches en attente avant les terminées", () => {
    const todos = [
      makeTodo({ id: "done", status: "completed" }),
      makeTodo({ id: "pending", status: "pending" }),
    ];
    expect(sortTodos(todos).map((t) => t.id)).toEqual(["pending", "done"]);
  });

  it("ordonne par priorité à statut égal", () => {
    const todos = [
      makeTodo({ id: "low", priority: "low" }),
      makeTodo({ id: "high", priority: "high" }),
      makeTodo({ id: "normal", priority: "normal" }),
    ];
    expect(sortTodos(todos).map((t) => t.id)).toEqual(["high", "normal", "low"]);
  });

  it("ordonne par date de création décroissante à statut et priorité égaux", () => {
    const todos = [
      makeTodo({ id: "old", created_at: "2026-01-01T00:00:00.000Z" }),
      makeTodo({ id: "new", created_at: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(sortTodos(todos).map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const todos = [makeTodo({ id: "a" }), makeTodo({ id: "b" })];
    const snapshot = [...todos];
    sortTodos(todos);
    expect(todos).toEqual(snapshot);
  });
});
