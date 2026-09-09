import { describe, expect, it } from "vitest";
import { minutage, nomDeNote, reduire } from "./voix";

describe("reduire", () => {
  it("rend toujours la même largeur de silhouette", () => {
    // Quelle que soit la longueur de la note : la bande fait la même largeur
    // à l'écran, et c'est elle qui décide du nombre de crêtes.
    expect(reduire(Array(12).fill(0.5))).toHaveLength(96);
    expect(reduire(Array(4000).fill(0.5))).toHaveLength(96);
  });

  it("garde le maximum de chaque tranche, pas la moyenne", () => {
    // Un accent isolé dans le silence doit se VOIR. Moyenner l'aurait dilué à
    // presque rien, et trente secondes de parole rendraient un trait droit.
    const mesures = Array(960).fill(0);
    mesures[500] = 0.8;
    const forme = reduire(mesures);
    expect(Math.max(...forme)).toBe(1);
    // Et une seule tranche le porte : 960 mesures pour 96 crêtes.
    expect(forme.filter((v) => v > 0)).toHaveLength(1);
  });

  it("normalise une voix douce", () => {
    // Parler à trente centimètres du micro ne doit pas rendre un trait plat :
    // la silhouette dit le rythme, pas le volume.
    expect(Math.max(...reduire([0.04, 0.12, 0.08]))).toBe(1);
  });

  it("ne fait pas parler un silence", () => {
    // Sous le plancher il n'y a que le souffle de la pièce. L'amplifier
    // dessinerait une conversation là où il n'y en a pas eu.
    const forme = reduire(Array(200).fill(0.01));
    expect(Math.max(...forme)).toBeLessThan(0.05);
  });

  it("survit à une note trop courte pour être mesurée", () => {
    expect(reduire([])).toEqual([]);
  });
});

describe("minutage", () => {
  it.each([
    [0, "0:00"],
    [7_400, "0:07"],
    [67_000, "1:07"],
    [605_000, "10:05"],
  ])("%i ms se lisent « %s »", (ms, attendu) => {
    expect(minutage(ms)).toBe(attendu);
  });
});

describe("nomDeNote", () => {
  it("porte l'heure LOCALE", () => {
    // `toISOString()` rendrait UTC : une note de 21 h porterait, selon le
    // fuseau, le nom du lendemain.
    const quand = new Date(2026, 8, 9, 21, 5);
    expect(nomDeNote(quand)).toBe("note-vocale-2026-09-09-21h05.webm");
  });
});
