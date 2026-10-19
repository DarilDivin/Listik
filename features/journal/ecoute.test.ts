import { describe, expect, it } from "vitest";
import { creerOreille, versUnite } from "./ecoute";

describe("versUnite", () => {
  it("reste entre 0 et 1, même hors de la plage", () => {
    expect(versUnite(-200, -20)).toBe(0);
    expect(versUnite(0, -20)).toBe(1);
    const milieu = versUnite(-40, -20);
    expect(milieu).toBeGreaterThan(0);
    expect(milieu).toBeLessThan(1);
  });

  it("rend zéro pour une case muette (−Infinity) ou un NaN", () => {
    expect(versUnite(-Infinity)).toBe(0);
    expect(versUnite(Number.NaN)).toBe(0);
  });
});

describe("creerOreille", () => {
  it("sans analyseur, tout reste au silence", () => {
    const oreille = creerOreille(null);
    const e = oreille.lire(1 / 60);
    expect(e.niveau).toBe(0);
    expect(e.elan).toBe(0);
  });

  it("à la sortie, retombe à zéro sans osciller hors de [−0,1 ; 1,2]", () => {
    const oreille = creerOreille(null);
    Object.assign(oreille.etat, {
      niveau: 1,
      elan: 1,
      graves: 1,
      mediums: 1,
      aigus: 1,
      attaque: 1,
    });
    for (let i = 0; i < 90; i++) {
      const e = oreille.eteindre(1 / 60);
      expect(e.elan).toBeGreaterThan(-0.1);
      expect(e.elan).toBeLessThan(1.2);
    }
    const fin = oreille.etat;
    expect(fin.niveau).toBeLessThan(0.01);
    expect(Math.abs(fin.elan)).toBeLessThan(0.05);
    expect(fin.attaque).toBeLessThan(0.01);
  });

  it("une image très longue (onglet en veille) ne fait pas diverger le ressort", () => {
    const oreille = creerOreille(null);
    oreille.etat.niveau = 1;
    const e = oreille.eteindre(5);
    expect(Number.isFinite(e.elan)).toBe(true);
  });
});
