import { describe, expect, it } from "vitest";
import { poids } from "./poids";

describe("poids", () => {
  it.each([
    [512, "512 o"],
    [1024, "1 Ko"],
    [86016, "84 Ko"],
    [1468006, "1,4 Mo"],
    [0, "0 o"],
  ])("%i octets se disent « %s »", (octets, attendu) => {
    expect(poids(octets)).toBe(attendu);
  });

  it("lit ce que ts-rs rend d'un i64", () => {
    expect(poids(86016n)).toBe("84 Ko");
  });

  it("ne dit rien d'une taille inconnue", () => {
    // Les pièces attachées avant la colonne `taille` : « 0 o » serait faux.
    expect(poids(null)).toBe("");
  });
});
