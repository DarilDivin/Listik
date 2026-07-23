import { describe, it, expect } from "vitest";
import {
  applyOrdering,
  dropIntent,
  orderingContextOf,
  reorderIds,
} from "./ordering";
import type { Todo } from "./types";

const TODAY = "2026-06-14";
const TOMORROW = "2026-06-15";

function todo(partial: Partial<Todo> & { id: string }): Todo {
  return {
    id: partial.id,
    text: partial.text ?? "Tâche",
    note: null,
    list: null,
    status: partial.status ?? "pending",
    priority: partial.priority ?? "normal",
    recurrence: "none",
    recur_interval: 1,
    recur_weekday: null,
    recur_setpos: null,
    recur_mode: "fixed",
    scheduled_for: partial.scheduled_for ?? null,
    due_date: partial.due_date ?? null,
    remind_at: null,
    project_id: partial.project_id ?? null,
    area_id: partial.area_id ?? null,
    heading_id: null,
    this_evening: partial.this_evening ?? false,
    someday: partial.someday ?? false,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    sub_tasks: [],
    tags: [],
  };
}

describe("orderingContextOf", () => {
  it("ordre manuel pour today/inbox/anytime/someday, automatique ailleurs", () => {
    expect(orderingContextOf("today")).toBe("today");
    expect(orderingContextOf("inbox")).toBe("inbox");
    // En retard se trie par retard : son travail est de rappeler
    // chronologiquement — l'ordre manuel y serait un mensonge.
    expect(orderingContextOf("overdue")).toBeNull();
    expect(orderingContextOf("tomorrow")).toBeNull();
    expect(orderingContextOf("upcoming")).toBeNull();
    expect(orderingContextOf("completed")).toBeNull();
  });
});

describe("applyOrdering", () => {
  const a = todo({ id: "a" });
  const b = todo({ id: "b" });
  const c = todo({ id: "c" });

  it("sans positions : ordre d'entrée inchangé", () => {
    expect(applyOrdering([a, b, c], undefined)).toEqual([a, b, c]);
    expect(applyOrdering([a, b, c], new Map())).toEqual([a, b, c]);
  });

  it("trie par position, en ignorant les ids disparus", () => {
    const positions = new Map([
      ["c", 0],
      ["a", 1],
      ["fantome", 2],
    ]);
    expect(applyOrdering([a, c], positions).map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("les non-positionnées passent DEVANT (la capture fraîche reste visible)", () => {
    const positions = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    // « c » vient d'être capturée : elle n'a pas de position.
    expect(applyOrdering([c, a, b], positions).map((t) => t.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("entre positionnées : la position SEULE (une cochée en pause LINGER ne saute pas)", () => {
    const done = todo({ id: "a", status: "completed" });
    const positions = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    expect(applyOrdering([done, b], positions).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("reorderIds", () => {
  it("insère au-dessus ou en-dessous de la cible", () => {
    expect(reorderIds(["a", "b", "c"], "c", "a", "top")).toEqual(["c", "a", "b"]);
    expect(reorderIds(["a", "b", "c"], "a", "c", "bottom")).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], "a", "b", "top")).toEqual(["a", "b", "c"]);
  });

  it("cible = déplacée ou introuvable : inchangé", () => {
    expect(reorderIds(["a", "b"], "a", "a", "top")).toEqual(["a", "b"]);
    expect(reorderIds(["a", "b"], "a", "zz", "top")).toEqual(["a", "b"]);
  });
});

describe("dropIntent — le mapping cible → mutation", () => {
  it("déposer sur Aujourd'hui planifie aujourd'hui et sort de Ce soir / Un jour", () => {
    expect(
      dropIntent({ kind: "view", view: "today" }, todo({ id: "a" }), TODAY, TOMORROW),
    ).toEqual({ scheduled_for: TODAY, someday: false, this_evening: false });

    // Déjà exactement là : no-op — ne pas écrire pour rien.
    expect(
      dropIntent(
        { kind: "view", view: "today" },
        todo({ id: "a", scheduled_for: TODAY }),
        TODAY,
        TOMORROW,
      ),
    ).toBeNull();
  });

  it("déposer sur À venir planifie demain", () => {
    expect(
      dropIntent({ kind: "view", view: "upcoming" }, todo({ id: "a" }), TODAY, TOMORROW),
    ).toEqual({ scheduled_for: TOMORROW, someday: false });
  });

  it("déposer sur Un jour pose le drapeau", () => {
    expect(
      dropIntent({ kind: "view", view: "someday" }, todo({ id: "a" }), TODAY, TOMORROW),
    ).toEqual({ someday: true });
    expect(
      dropIntent(
        { kind: "view", view: "someday" },
        todo({ id: "a", someday: true }),
        TODAY,
        TOMORROW,
      ),
    ).toBeNull();
  });

  it("Quand je peux exige un rattachement (sinon la tâche retomberait en inbox)", () => {
    // Sans projet ni domaine : refusé — un dépôt qui atterrit ailleurs que
    // sur sa cible est pire qu'un dépôt refusé.
    expect(
      dropIntent(
        { kind: "view", view: "anytime" },
        todo({ id: "a", scheduled_for: TODAY }),
        TODAY,
        TOMORROW,
      ),
    ).toBeNull();

    expect(
      dropIntent(
        { kind: "view", view: "anytime" },
        todo({ id: "a", scheduled_for: TODAY, project_id: "p1" }),
        TODAY,
        TOMORROW,
      ),
    ).toEqual({ scheduled_for: null, someday: false, this_evening: false });
  });

  it("retour à la Boîte de réception = dé-trier entièrement", () => {
    expect(
      dropIntent(
        { kind: "view", view: "inbox" },
        todo({ id: "a", scheduled_for: TODAY, project_id: "p1", someday: false }),
        TODAY,
        TOMORROW,
      ),
    ).toEqual({
      scheduled_for: null,
      someday: false,
      this_evening: false,
      project_id: null,
      area_id: null,
    });
  });

  it("le Journal refuse tout dépôt (terminer est un geste, pas un dépôt)", () => {
    expect(
      dropIntent({ kind: "view", view: "journal" }, todo({ id: "a" }), TODAY, TOMORROW),
    ).toBeNull();
  });

  it("déposer sur un projet affecte (et quitte le domaine direct) ; no-op si déjà dedans", () => {
    expect(
      dropIntent(
        { kind: "project", id: "p1" },
        todo({ id: "a", area_id: "ar1" }),
        TODAY,
        TOMORROW,
      ),
    ).toEqual({ project_id: "p1", area_id: null });

    expect(
      dropIntent(
        { kind: "project", id: "p1" },
        todo({ id: "a", project_id: "p1" }),
        TODAY,
        TOMORROW,
      ),
    ).toBeNull();
  });
});
