import { describe, it, expect } from "vitest";
import {
  deadlineCountdown,
  lendemainISO,
  msAvantMinuit,
  toLocalISODate,
} from "./date";

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

describe("lendemainISO", () => {
  it("passe au jour suivant dans le même mois", () => {
    expect(lendemainISO("2026-10-21")).toBe("2026-10-22");
  });

  it("franchit la fin du mois", () => {
    expect(lendemainISO("2026-10-31")).toBe("2026-11-01");
  });

  it("franchit la fin de l'année", () => {
    expect(lendemainISO("2026-12-31")).toBe("2027-01-01");
  });

  it("connaît le 29 février d'une année bissextile", () => {
    expect(lendemainISO("2028-02-28")).toBe("2028-02-29");
  });

  it("reste juste la veille d'un changement d'heure", () => {
    expect(lendemainISO("2026-03-28")).toBe("2026-03-29");
  });
});

describe("msAvantMinuit", () => {
  it("une minute avant minuit", () => {
    expect(msAvantMinuit(new Date(2026, 9, 21, 23, 59, 0))).toBe(60_000);
  });

  it("à minuit pile, il reste un jour entier", () => {
    expect(msAvantMinuit(new Date(2026, 9, 21, 0, 0, 0))).toBe(86_400_000);
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
