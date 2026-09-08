import { describe, expect, it } from "vitest";
import { MARQUE_DEBUT, MARQUE_FIN } from "./api";
import { morceaux, sansMarkdown } from "./extrait";

/** Un extrait tel que FTS5 le rend, marques comprises. */
const m = (texte: string) => `${MARQUE_DEBUT}${texte}${MARQUE_FIN}`;

describe("morceaux", () => {
  it("sépare ce qui a été trouvé du reste", () => {
    expect(morceaux(`Passé à l'${m("épicerie")} du coin.`)).toEqual([
      { texte: "Passé à l'", trouve: false },
      { texte: "épicerie", trouve: true },
      { texte: " du coin.", trouve: false },
    ]);
  });

  it("gère plusieurs occurrences", () => {
    expect(morceaux(`${m("le")} chat et ${m("le")} chien`)).toEqual([
      { texte: "le", trouve: true },
      { texte: " chat et ", trouve: false },
      { texte: "le", trouve: true },
      { texte: " chien", trouve: false },
    ]);
  });

  it("rend le texte tel quel quand rien n'est marqué", () => {
    expect(morceaux("juste du texte")).toEqual([
      { texte: "juste du texte", trouve: false },
    ]);
  });

  it("ne casse pas sur une marque orpheline", () => {
    // `snippet` tronque : l'extrait peut s'arrêter au milieu d'une occurrence.
    expect(morceaux(`avant ${MARQUE_DEBUT}coupé`)).toEqual([
      { texte: `avant ${MARQUE_DEBUT}coupé`, trouve: false },
    ]);
  });

  it("rend une liste vide pour un extrait vide", () => {
    expect(morceaux("")).toEqual([]);
  });

  it("efface le renvoi d'une image sans perdre la marque posée dans sa légende", () => {
    // Le cas qui impose de nettoyer AVANT de découper : la marque tombe au
    // milieu de la syntaxe. Morceau par morceau, on ne verrait jamais que
    // `![La ` d'un côté et `, juste avant.](piece:…)` de l'autre — et l'uuid
    // s'afficherait en plein résultat.
    expect(
      morceaux(`![La ${m("terrasse")}, juste avant.](piece:f9aa0944-8d1e)`),
    ).toEqual([
      { texte: "La ", trouve: false },
      { texte: "terrasse", trouve: true },
      { texte: ", juste avant.", trouve: false },
    ]);
  });
});

describe("sansMarkdown", () => {
  it.each([
    ["## Un titre", "Un titre"],
    ["> Une citation", "Une citation"],
    ["- une puce", "une puce"],
    ["1. un point", "un point"],
    ["du **gras** et du `code`", "du gras et du code"],
    // Une image vaut sa légende — jamais son renvoi interne.
    ["![La terrasse](piece:f9aa0944-8d1e)", "La terrasse"],
    ["![](piece:f9aa0944-8d1e)", ""],
    ["[le guide](https://exemple.dev)", "le guide"],
    // `snippet` coupe à quatorze mots, des deux côtés de la syntaxe.
    ["![La terrasse](piece:f9aa", "La terrasse"],
    ["terrasse.](piece:f9aa0944-8d1e) Puis il a plu.", "terrasse. Puis il a plu."],
    ["![La terrasse, juste", "La terrasse, juste"],
    ["deux\n\nlignes", "deux lignes"],
    // Ce qui n'est pas de la mécanique reste : un tiret cadratin est du texte.
    ["un — tiret", "un — tiret"],
  ])("« %s » devient « %s »", (avant, apres) => {
    expect(sansMarkdown(avant)).toBe(apres);
  });
});

describe("sansMarkdown ne soude pas deux lignes", () => {
  it("garde l'espace que le retour à la ligne portait", () => {
    // Un extrait coupe souvent au milieu d'une liste : le fragment commence
    // alors par le retour à la ligne QUI SÉPARE deux puces. Le manger colle
    // les deux — « le journall'assistant ».
    expect(sansMarkdown("\n- l'assistant\n- l'omnibar")).toBe(" l'assistant l'omnibar");
    expect(sansMarkdown("fin.\n\n- une puce")).toBe("fin. une puce");
    expect(sansMarkdown("\n## Un titre")).toBe(" Un titre");
    expect(sansMarkdown("\n> Une citation")).toBe(" Une citation");
    expect(sansMarkdown("\n1. un point")).toBe(" un point");
  });
});
