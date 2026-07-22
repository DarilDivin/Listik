import { describe, it, expect } from "vitest";
import { deadlineCountdown, toLocalISODate } from "./date";

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

describe("deadlineCountdown", () => {
  it("compte à rebours J-N pour une échéance à venir", () => {
    expect(deadlineCountdown("2026-06-17", "2026-06-14")).toEqual({
      label: "J-3",
      reached: false,
    });
  });

  it("J-0 le jour même — atteinte", () => {
    expect(deadlineCountdown("2026-06-14", "2026-06-14")).toEqual({
      label: "J-0",
      reached: true,
    });
  });

  it("J+N une fois dépassée", () => {
    expect(deadlineCountdown("2026-06-12", "2026-06-14")).toEqual({
      label: "J+2",
      reached: true,
    });
  });

  it("franchit les mois sans dériver", () => {
    expect(deadlineCountdown("2026-07-02", "2026-06-29").label).toBe("J-3");
  });
});
