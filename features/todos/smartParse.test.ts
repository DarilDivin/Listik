import { describe, it, expect } from "vitest";
import {
  detectListFromText,
  detectPriorityFromText,
  formatDateToNaturalText,
  splitNote,
  stripListFromText,
} from "./smartParse";

describe("detectPriorityFromText", () => {
  it("détecte high sur les mots-clés", () => {
    expect(detectPriorityFromText("réunion urgente")).toBe("high");
    expect(detectPriorityFromText("c'est important")).toBe("high");
    expect(detectPriorityFromText("fais ça !")).toBe("high");
  });

  it("détecte low", () => {
    expect(detectPriorityFromText("ranger le garage plus tard")).toBe("low");
  });

  it("retombe sur normal par défaut", () => {
    expect(detectPriorityFromText("acheter du pain")).toBe("normal");
  });
});

describe("splitNote", () => {
  it("ne renvoie que le texte sans //", () => {
    expect(splitNote("acheter du pain")).toEqual({
      mainText: "acheter du pain",
      note: undefined,
    });
  });

  it("sépare le texte de la note", () => {
    expect(splitNote("acheter du pain // bio de préférence")).toEqual({
      mainText: "acheter du pain",
      note: "bio de préférence",
    });
  });

  it("conserve les // à l'intérieur de la note", () => {
    expect(splitNote("a // b // c")).toEqual({ mainText: "a", note: "b // c" });
  });
});

describe("detectListFromText", () => {
  it("détecte un tag #liste", () => {
    expect(detectListFromText("acheter du lait #courses")).toEqual({
      list: "courses",
      match: { index: 16, text: "#courses" },
    });
  });

  it("renvoie null sans tag", () => {
    expect(detectListFromText("acheter du lait")).toBeNull();
  });

  it("ignore un # situé dans la note (après //)", () => {
    expect(detectListFromText("acheter // voir #promo")).toBeNull();
  });
});

describe("stripListFromText", () => {
  it("retire le tag et normalise les espaces", () => {
    expect(stripListFromText("acheter du lait #courses")).toBe("acheter du lait");
    expect(stripListFromText("#courses acheter du lait")).toBe("acheter du lait");
  });

  it("laisse le texte intact sans tag", () => {
    expect(stripListFromText("acheter du lait")).toBe("acheter du lait");
  });
});

describe("formatDateToNaturalText", () => {
  it("renvoie aujourd'hui pour la date du jour", () => {
    expect(formatDateToNaturalText(new Date())).toBe("aujourd'hui");
  });

  it("renvoie demain pour le lendemain", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDateToNaturalText(tomorrow)).toBe("demain");
  });
});
