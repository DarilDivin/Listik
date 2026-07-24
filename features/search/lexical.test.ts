import { describe, it, expect } from "vitest";
import { lexicalMatch } from "./lexical";

const items = [
  { id: "1", name: "Épicerie" },
  { id: "2", name: "Épices du monde" },
  { id: "3", name: "Voyage" },
  { id: "4", name: "Perso" },
];

describe("lexicalMatch", () => {
  it("insensible à la casse ET aux diacritiques — le vrai piège d'une app en français", () => {
    // Sans normalisation NFD, "epic" ne matcherait jamais "Épicerie" : NOCASE
    // seule (côté SQLite) ne gère pas les accents.
    expect(lexicalMatch(items, "epic").map((i) => i.id)).toEqual(["1", "2"]);
    expect(lexicalMatch(items, "ÉPIC").map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("classe les correspondances en tête de nom avant les autres", () => {
    const r = lexicalMatch(items, "voy");
    expect(r.map((i) => i.id)).toEqual(["3"]);
  });

  it("à correspondance égale, classe par position puis longueur du nom", () => {
    // "Épicerie" (index 0) devant "Épices du monde" (index 0 aussi, mais
    // plus court) — les deux commencent par "épic".
    const r = lexicalMatch(items, "épic");
    expect(r.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("chaîne vide → aucun résultat (pas tout renvoyer)", () => {
    expect(lexicalMatch(items, "")).toEqual([]);
    expect(lexicalMatch(items, "   ")).toEqual([]);
  });

  it("aucune correspondance → liste vide", () => {
    expect(lexicalMatch(items, "zzz")).toEqual([]);
  });
});
