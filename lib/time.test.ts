import { describe, it, expect } from "vitest";
import { parseTime, formatTime } from "./time";

describe("formatTime", () => {
  it("zéro-padde heures et minutes", () => {
    expect(formatTime(9, 5)).toBe("09:05");
    expect(formatTime(18, 30)).toBe("18:30");
  });
});

describe("parseTime", () => {
  it("interprète une heure seule", () => {
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("09")).toBe("09:00");
    expect(parseTime("23")).toBe("23:00");
  });

  it("interprète une suite compacte de chiffres", () => {
    expect(parseTime("930")).toBe("09:30");
    expect(parseTime("1815")).toBe("18:15");
    expect(parseTime("0905")).toBe("09:05");
  });

  it("accepte les séparateurs : . h et espace", () => {
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("9.30")).toBe("09:30");
    expect(parseTime("9 30")).toBe("09:30");
    expect(parseTime("9h")).toBe("09:00");
    expect(parseTime("9h30")).toBe("09:30");
  });

  it("gère le méridien am/pm", () => {
    expect(parseTime("9pm")).toBe("21:00");
    expect(parseTime("9 pm")).toBe("21:00");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12pm")).toBe("12:00");
    expect(parseTime("9:30 pm")).toBe("21:30");
  });

  it("rejette les valeurs invalides", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("24")).toBeNull();
    expect(parseTime("9:60")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("99999")).toBeNull();
  });
});
