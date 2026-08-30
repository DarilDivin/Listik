import { describe, expect, it } from "vitest";
import type { SerializedLexicalNode } from "lexical";
import {
  decouperEnSegments,
  estVide,
  markdownDepuisNoeuds,
  noeudsDepuisMarkdown,
} from "./feuille";

/** Un repère sérialisé, tel qu'il vit dans le document. */
const repere = (entryId: string, heure: string): SerializedLexicalNode =>
  ({ type: "repere", version: 1, entryId, heure }) as never;

/** Le document tel que la page le composerait pour ces reprises. */
const feuille = (...reprises: Array<[string, string, string]>) =>
  reprises.flatMap(([id, heure, md]) => [
    repere(id, heure),
    ...noeudsDepuisMarkdown(md),
  ]);

describe("aller-retour markdown", () => {
  it.each([
    "Un paragraphe simple.",
    "Deux paragraphes.\n\nLe second.",
    "- premier\n- deuxieme",
    "1. un\n2. deux",
    "## Un titre\n\nDu texte dessous.",
    "> Une citation.",
  ])("garde « %s » intact", (markdown) => {
    expect(markdownDepuisNoeuds(noeudsDepuisMarkdown(markdown))).toBe(markdown);
  });

  it("normalise l'italique en étoiles, et s'y tient", () => {
    // Lexical sérialise l'italique avec des étoiles quelle que soit l'écriture
    // d'entrée. On le note pour que la NORMALISATION ne passe jamais pour une
    // modification de l'auteur : le second aller-retour ne bouge plus.
    const une = markdownDepuisNoeuds(noeudsDepuisMarkdown("de l'_italique_"));
    expect(une).toBe("de l'*italique*");
    expect(markdownDepuisNoeuds(noeudsDepuisMarkdown(une))).toBe(une);
  });

  it("rend une chaîne vide pour aucun nœud", () => {
    expect(markdownDepuisNoeuds([])).toBe("");
  });
});

describe("decouperEnSegments", () => {
  it("découpe le document à chaque repère", () => {
    const doc = feuille(
      ["a", "08:12", "Réveillé tôt.\n\nCafé."],
      ["b", "11:40", "- une puce\n- une autre"],
      ["c", "19:05", "Fin de journée."],
    );
    expect(decouperEnSegments(doc)).toEqual([
      { entryId: "a", heure: "08:12", markdown: "Réveillé tôt.\n\nCafé." },
      { entryId: "b", heure: "11:40", markdown: "- une puce\n- une autre" },
      { entryId: "c", heure: "19:05", markdown: "Fin de journée." },
    ]);
  });

  it("rend une reprise vide quand on a tout effacé", () => {
    // C'est ce qui permet à la page de supprimer la ligne en base : le repère
    // est resté, son texte a disparu.
    const doc = [repere("a", "08:12"), repere("b", "11:40"), ...noeudsDepuisMarkdown("Reste.")];
    expect(decouperEnSegments(doc)).toEqual([
      { entryId: "a", heure: "08:12", markdown: "" },
      { entryId: "b", heure: "11:40", markdown: "Reste." },
    ]);
  });

  it("rattache au premier repère ce qui a été écrit au-dessus de lui", () => {
    // On ne perd pas du texte parce qu'il a atterri trop haut.
    const doc = [
      ...noeudsDepuisMarkdown("Écrit tout en haut."),
      repere("a", "08:12"),
      ...noeudsDepuisMarkdown("La reprise."),
    ];
    expect(decouperEnSegments(doc)).toEqual([
      { entryId: "a", heure: "08:12", markdown: "Écrit tout en haut.\n\nLa reprise." },
    ]);
  });

  it("sans aucun repère, tout le document est une reprise sans identité", () => {
    const doc = noeudsDepuisMarkdown("Du texte orphelin.");
    expect(decouperEnSegments(doc)).toEqual([
      { entryId: "", heure: "", markdown: "Du texte orphelin." },
    ]);
  });

  it("survit à la disparition d'un repère : deux reprises n'en font plus qu'une", () => {
    // Le geste réel : Retour arrière collé au début du bloc qui suit le
    // repère. Le texte des deux moments se recolle, dans l'ordre.
    const doc = feuille(["a", "08:12", "Le matin."], ["b", "11:40", "Plus tard."]);
    const sansRepere = doc.filter(
      (n) => !(n.type === "repere" && (n as never as { entryId: string }).entryId === "b"),
    );
    expect(decouperEnSegments(sansRepere)).toEqual([
      { entryId: "a", heure: "08:12", markdown: "Le matin.\n\nPlus tard." },
    ]);
  });
});

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

describe("le paragraphe vide de queue ne s'enregistre pas", () => {
  it("laisse tomber les lignes blanches des extrémités", () => {
    // La feuille se termine toujours par un paragraphe vide : c'est là qu'on
    // écrit. Il n'a rien à faire dans ce qu'on garde.
    const doc = [
      repere("a", "08:12"),
      ...noeudsDepuisMarkdown("Le texte.\n\n"),
      ...noeudsDepuisMarkdown(""),
    ];
    expect(decouperEnSegments(doc)).toEqual([
      { entryId: "a", heure: "08:12", markdown: "Le texte." },
    ]);
  });
});
