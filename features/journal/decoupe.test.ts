import { describe, expect, it } from "vitest";
import { estVide } from "./decoupe";

describe("estVide", () => {
  it.each([
    ["", true],
    ["   \n  ", true],
    ["- ", true],
    ["1. ", true],
    ["## ", true],
    ["> ", true],
    ["```\n```", true],
    ["- a", false],
    ["Bonjour", false],
    ["## Un titre", false],
    // Ce qui n'est pas un marqueur reste du contenu, si court soit-il.
    ["—", false],
    ["…", false],
    ["🙂", false],
  ])("« %s » vide ? %s", (markdown, attendu) => {
    expect(estVide(markdown)).toBe(attendu);
  });
});
