import { describe, it, expect } from "vitest";
import { dayElapsedFraction, dayRemainder } from "./day-progress";

/** Un instant du jour, en heure locale. */
const at = (h: number, m = 0) => new Date(2026, 7, 25, h, m);

describe("dayElapsedFraction", () => {
  it("part de zéro au début de la journée utile", () => {
    expect(dayElapsedFraction(at(7))).toBe(0);
  });

  it("atteint un à la fin", () => {
    expect(dayElapsedFraction(at(23))).toBe(1);
  });

  it("progresse régulièrement entre les deux", () => {
    // 7 h → 23 h = 16 h ; 15 h est à 8 h du début, soit la moitié.
    expect(dayElapsedFraction(at(15))).toBeCloseTo(0.5, 5);
  });

  it("ne rend rien hors des heures utiles", () => {
    // Sur un cadran, 0 % et 100 % sont le même point : mieux vaut ne rien
    // montrer que de faire croire que la journée recommence.
    expect(dayElapsedFraction(at(3))).toBeNull();
    expect(dayElapsedFraction(at(23, 30))).toBeNull();
    expect(dayElapsedFraction(at(6, 59))).toBeNull();
  });
});

describe("dayRemainder", () => {
  it("distingue avant et après la journée utile", () => {
    // `null` ne suffisait pas : 6 h et minuit ne se racontent pas pareil.
    expect(dayRemainder(at(6)).kind).toBe("before");
    expect(dayRemainder(at(23, 30)).kind).toBe("after");
  });

  it("compte les minutes restantes jusqu'à 23 h", () => {
    expect(dayRemainder(at(15))).toEqual({ kind: "left", minutes: 480 });
    expect(dayRemainder(at(22, 30))).toEqual({ kind: "left", minutes: 30 });
  });

  it("les bornes appartiennent à la journée", () => {
    expect(dayRemainder(at(7))).toEqual({ kind: "left", minutes: 960 });
    expect(dayRemainder(at(23))).toEqual({ kind: "left", minutes: 0 });
  });
});
