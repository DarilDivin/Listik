import { describe, it, expect } from "vitest";
import { nextOccurrence } from "./recurrence";

describe("nextOccurrence", () => {
  // 2026-06-14 est un dimanche.
  it("avance d'un jour en quotidien", () => {
    expect(nextOccurrence("2026-06-14", "daily")).toBe("2026-06-15");
  });

  it("avance d'une semaine en hebdomadaire", () => {
    expect(nextOccurrence("2026-06-14", "weekly")).toBe("2026-06-21");
  });

  it("avance d'un mois en mensuel", () => {
    expect(nextOccurrence("2026-06-14", "monthly")).toBe("2026-07-14");
  });

  it("saute le week-end en jours ouvrés (vendredi → lundi)", () => {
    expect(nextOccurrence("2026-06-12", "weekdays")).toBe("2026-06-15");
  });

  it("renvoie la date inchangée si none", () => {
    expect(nextOccurrence("2026-06-14", "none")).toBe("2026-06-14");
  });
});
