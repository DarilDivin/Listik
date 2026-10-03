import { describe, expect, it } from "vitest";
import { decideOnboarding, destinationOf, newIds } from "./onboarding";

const EMPTY = { todos: 0, projects: 0, areas: 0, journalDays: 0 };

describe("decideOnboarding", () => {
  it("montre l'accueil sur une installation neuve", () => {
    expect(decideOnboarding(null, EMPTY)).toBe("show");
  });

  it("ne le montre jamais deux fois", () => {
    expect(decideOnboarding("1", EMPTY)).toBe("none");
  });

  it("le marque vu sans le montrer à qui a déjà des données (mise à jour)", () => {
    expect(decideOnboarding(null, { ...EMPTY, todos: 3 })).toBe("mark-done");
    expect(decideOnboarding(null, { ...EMPTY, projects: 1 })).toBe("mark-done");
    expect(decideOnboarding(null, { ...EMPTY, areas: 1 })).toBe("mark-done");
    expect(decideOnboarding(null, { ...EMPTY, journalDays: 2 })).toBe("mark-done");
  });
});

describe("destinationOf", () => {
  const today = "2026-10-03";

  it("aujourd'hui, ou une date passée, mène à Aujourd'hui", () => {
    expect(destinationOf(today, today)).toEqual({ view: "today", label: "Aujourd’hui" });
    expect(destinationOf("2026-10-01", today).view).toBe("today");
  });

  it("une date future mène à À venir, avec le jour en toutes lettres", () => {
    const d = destinationOf("2026-10-04", today);
    expect(d.view).toBe("upcoming");
    expect(d.label).toBe("À venir · dimanche 4 octobre");
  });

  it("une tâche sans date reste dans la Boîte de réception", () => {
    expect(destinationOf(null, today).view).toBe("inbox");
  });
});

describe("newIds", () => {
  it("ne retient que les tâches apparues depuis l'instantané", () => {
    const before = new Set(["a", "b"]);
    expect(newIds(before, [{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual(["c"]);
    expect(newIds(before, [{ id: "a" }])).toEqual([]);
  });
});
