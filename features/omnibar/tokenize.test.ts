import { describe, it, expect } from "vitest";
import { tokenizeCapture, type Segment } from "./tokenize";

/** Raccourci de lecture : « type:texte » pour chaque segment. */
const shape = (text: string) =>
  tokenizeCapture(text).map((s: Segment) => `${s.kind ?? "plain"}:${s.text}`);

/** Invariant structurel : les segments recouvrent la saisie, sans trou. */
const covers = (text: string) => tokenizeCapture(text).map((s) => s.text).join("") === text;

describe("tokenizeCapture", () => {
  it("rend un seul segment quand rien n'est reconnu", () => {
    expect(shape("acheter du pain")).toEqual(["plain:acheter du pain"]);
  });

  it("isole la date dans la phrase", () => {
    expect(shape("acheter du pain demain")).toEqual([
      "plain:acheter du pain ",
      "date:demain",
    ]);
  });

  it("isole le projet et les tags", () => {
    expect(shape("relire #Boulot @urgent")).toEqual([
      "plain:relire ",
      "project:#Boulot",
      "plain: ",
      "tag:@urgent",
    ]);
  });

  it("ferme le texte sur la note et n'y reconnaît plus rien", () => {
    expect(shape("appeler Jean // demain #Boulot")).toEqual([
      "plain:appeler Jean ",
      "noteMarker://",
      "note: demain #Boulot",
    ]);
  });

  it("garde l'ordre quand plusieurs natures se suivent", () => {
    expect(shape("payer #Maison demain @perso")).toEqual([
      "plain:payer ",
      "project:#Maison",
      "plain: ",
      "date:demain",
      "plain: ",
      "tag:@perso",
    ]);
  });

  it("recouvre toujours la saisie, quoi qu'on lui donne", () => {
    for (const t of [
      "",
      "a",
      "demain",
      "#p",
      "@t",
      "//",
      "réunion le 3 juin // avec @paul",
      "  espaces   multiples  demain  ",
    ]) {
      expect(covers(t)).toBe(true);
    }
  });

  it("n'émet jamais de segment vide", () => {
    for (const t of ["demain", "#p @t", "// note", "x"]) {
      expect(tokenizeCapture(t).every((s) => s.text.length > 0)).toBe(true);
    }
  });

  it("rend des bornes cohérentes avec le texte", () => {
    const texte = "relire #Boulot demain";
    for (const s of tokenizeCapture(texte)) {
      expect(texte.slice(s.start, s.end)).toBe(s.text);
    }
  });
});
