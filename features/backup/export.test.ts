import { describe, expect, it } from "vitest";
import { manquants, resume, type SauvegardeBilan } from "./export";

const bilan = (p: Partial<SauvegardeBilan> = {}): SauvegardeBilan => ({
  taches: 0,
  jours: 0,
  pieces: 0,
  pieces_manquantes: 0,
  ...p,
});

describe("resume", () => {
  it("dit les trois nombres", () => {
    expect(resume(bilan({ taches: 128, jours: 43, pieces: 12 }))).toBe(
      "128 tâches, 43 jours de journal, 12 pièces",
    );
  });

  it("accorde au singulier", () => {
    expect(resume(bilan({ taches: 1, jours: 1, pieces: 1 }))).toBe(
      "1 tâche, 1 jour de journal, 1 pièce",
    );
  });

  it("tait ce qui est vide", () => {
    // « 0 jour de journal » n'apprend rien et allonge la phrase. Les tâches,
    // elles, se disent toujours — c'est le cœur de la sauvegarde.
    expect(resume(bilan({ taches: 9 }))).toBe("9 tâches");
    expect(resume(bilan({ taches: 9, pieces: 2 }))).toBe("9 tâches, 2 pièces");
  });

  it("dit une base vide plutôt que de ne rien dire", () => {
    expect(resume(bilan())).toBe("0 tâche");
  });
});

describe("manquants", () => {
  it("ne dit rien quand tout a été copié", () => {
    expect(manquants(bilan({ pieces: 12 }))).toBeNull();
  });

  it("prévient quand des octets ont été perdus", () => {
    // Taire le cas ferait croire la sauvegarde complète.
    expect(manquants(bilan({ pieces_manquantes: 3 }))).toContain("3 pièces");
    expect(manquants(bilan({ pieces_manquantes: 1 }))).toContain("Une pièce");
  });
});
