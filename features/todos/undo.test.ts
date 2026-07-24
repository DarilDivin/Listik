import { describe, it, expect } from "vitest";
import { restorePayloadForToggle } from "./undo";
import type { Todo } from "./types";

function todo(partial: Partial<Todo>): Todo {
  return {
    id: "t1",
    text: "Tâche",
    note: null,
    list: null,
    status: "pending",
    priority: "normal",
    recurrence: "none",
    recur_interval: 1,
    recur_weekday: null,
    recur_setpos: null,
    recur_mode: "fixed",
    scheduled_for: null,
    due_date: null,
    remind_at: null,
    project_id: null,
    area_id: null,
    heading_id: null,
    this_evening: false,
    someday: false,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    sub_tasks: [],
    tags: [],
    ...partial,
  };
}

describe("restorePayloadForToggle — le seul vrai piège de K2", () => {
  it("tâche simple : ne restaure QUE le statut", () => {
    expect(restorePayloadForToggle(todo({ status: "pending" }))).toEqual({
      status: "pending",
    });
    expect(restorePayloadForToggle(todo({ status: "completed" }))).toEqual({
      status: "completed",
    });
  });

  it("récurrente en cours : restaure scheduled_for/due_date/remind_at — pas un simple statut", () => {
    // Piège : toggle() sur une récurrente AVANCE ces trois champs au lieu de
    // terminer. Rejouer toggle() pour « annuler » avancerait une 2e fois —
    // le payload de restauration doit donc porter les valeurs D'AVANT.
    const before = todo({
      status: "pending",
      recurrence: "weekly",
      scheduled_for: "2026-06-10",
      due_date: "2026-06-12",
      remind_at: "2026-06-10T09:00",
    });
    expect(restorePayloadForToggle(before)).toEqual({
      status: "pending",
      scheduled_for: "2026-06-10",
      due_date: "2026-06-12",
      remind_at: "2026-06-10T09:00",
    });
  });

  it("récurrente déjà terminée : restaure seulement le statut (rien à décaler en sens inverse)", () => {
    // Une tâche récurrente ne passe JAMAIS à `completed` via toggle() tant
    // qu'elle est pending — si elle est `completed`, c'est qu'elle a été
    // terminée autrement (recurrence == none entre-temps, ou cas limite) :
    // la restauration en statut simple est correcte.
    const before = todo({ status: "completed", recurrence: "weekly" });
    expect(restorePayloadForToggle(before)).toEqual({ status: "completed" });
  });

  it("récurrente sans échéance/rappel : ne les invente pas (restent null)", () => {
    const before = todo({
      status: "pending",
      recurrence: "daily",
      scheduled_for: "2026-06-10",
      due_date: null,
      remind_at: null,
    });
    expect(restorePayloadForToggle(before)).toEqual({
      status: "pending",
      scheduled_for: "2026-06-10",
      due_date: null,
      remind_at: null,
    });
  });
});
