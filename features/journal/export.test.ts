import { describe, expect, it } from "vitest";
import { resume } from "./export";

describe("resume", () => {
  it.each([
    [{ jours: 1, pieces: 0 }, "1 jour"],
    [{ jours: 12, pieces: 0 }, "12 jours"],
    [{ jours: 12, pieces: 1 }, "12 jours, 1 photo"],
    [{ jours: 12, pieces: 3 }, "12 jours, 3 photos"],
    // Un journal vide s'exporte quand même — le fichier existe, il est vide.
    [{ jours: 0, pieces: 0 }, "0 jour"],
  ])("%o se dit « %s »", (bilan, attendu) => {
    expect(resume(bilan)).toBe(attendu);
  });
});
