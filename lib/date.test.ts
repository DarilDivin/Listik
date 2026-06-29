import { describe, it, expect } from "vitest";
import { toLocalISODate } from "./date";

describe("toLocalISODate", () => {
  it("formate une date en YYYY-MM-DD local", () => {
    // 7 juin 2026 à 23h30 heure locale : toISOString() pourrait basculer
    // au 8 selon le fuseau ; la version locale doit rester le 07.
    const date = new Date(2026, 5, 7, 23, 30);
    expect(toLocalISODate(date)).toBe("2026-06-07");
  });

  it("complète le mois et le jour sur deux chiffres", () => {
    expect(toLocalISODate(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});
