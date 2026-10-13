import { describe, expect, it } from "vitest";
import type { SerializedLexicalNode } from "lexical";
import { noeudsDepuisMarkdown } from "./feuille";
import {
  blocsDepuisNoeuds,
  compterMots,
  enHtml,
  enTexte,
  nomDeFichier,
  piecesDe,
  repriseAutour,
} from "./passage";

const repere = (entryId: string, heure: string): SerializedLexicalNode =>
  ({ type: "repere", version: 1, entryId, heure }) as never;

/** Des blocs depuis du markdown, en passant par de VRAIS nœuds Lexical. */
const blocs = (md: string) => blocsDepuisNoeuds(noeudsDepuisMarkdown(md));

describe("blocsDepuisNoeuds", () => {
  it("lit la mise en forme en ligne", () => {
    expect(blocs("Il **faisait** *nuit* et ~~froid~~.")).toEqual([
      {
        type: "paragraphe",
        fragments: [
          { texte: "Il " },
          { texte: "faisait", gras: true },
          { texte: " " },
          { texte: "nuit", italique: true },
          { texte: " et " },
          { texte: "froid", barre: true },
          { texte: "." },
        ],
      },
    ]);
  });

  it("ne garde ni repère ni ligne blanche aux bords", () => {
    const noeuds = [
      repere("a", "14:05"),
      ...noeudsDepuisMarkdown("Premier.\n\nSecond."),
      { type: "paragraph", version: 1, children: [] } as never,
    ];
    expect(blocsDepuisNoeuds(noeuds).map((b) => b.type)).toEqual([
      "paragraphe",
      "paragraphe",
    ]);
  });

  it("garde une ligne blanche AU MILIEU — une coupure de scène", () => {
    const vide = { type: "paragraph", version: 1, children: [] } as never;
    const noeuds = [
      ...noeudsDepuisMarkdown("Avant."),
      vide,
      ...noeudsDepuisMarkdown("Après."),
    ];
    expect(blocsDepuisNoeuds(noeuds)).toHaveLength(3);
  });

  it("raccroche une sous-liste à l'élément qu'elle détaille", () => {
    const [liste] = blocs("- fruits\n    - pomme\n    - poire\n- légumes");
    expect(liste).toMatchObject({
      type: "liste",
      ordonnee: false,
      items: [
        { fragments: [{ texte: "fruits" }], sousListes: [{ items: [{}, {}] }] },
        { fragments: [{ texte: "légumes" }], sousListes: [] },
      ],
    });
  });

  it("refuse une cible de lien qui exécuterait quelque chose", () => {
    const lien = (url: string, texte: string) => ({
      type: "link",
      version: 1,
      url,
      children: [{ type: "text", version: 1, text: texte, format: 0 }],
    });
    const [p] = blocsDepuisNoeuds([
      {
        type: "paragraph",
        version: 1,
        children: [lien("https://exemple.fr", "sûr"), lien("javascript:alert(1)", "piège")],
      } as never,
    ]);
    // Le texte reste, la cible dangereuse tombe.
    expect(p).toEqual({
      type: "paragraphe",
      fragments: [{ texte: "sûr", lien: "https://exemple.fr" }, { texte: "piège" }],
    });
  });
});

describe("enTexte", () => {
  it("rend un texte sans aucune syntaxe", () => {
    const md = "## Le phare\n\nIl **faisait** *nuit*.\n\n> Une voix.\n\n- un\n- deux\n\n1. a\n2. b";
    expect(enTexte(blocs(md))).toBe(
      "Le phare\n\nIl faisait nuit.\n\nUne voix.\n\n• un\n• deux\n\n1. a\n2. b",
    );
  });

  it("ne laisse jamais filer un renvoi interne de pièce", () => {
    const t = enTexte(blocs("Avant.\n\n![La mer](piece:f9aa-01)\n\nAprès."));
    expect(t).toBe("Avant.\n\nAprès.");
    expect(t).not.toContain("piece:");
  });
});

describe("enHtml", () => {
  it("échappe ce que la prose contient", () => {
    expect(enHtml(blocs("a < b & \"c\""))).toBe("<p>a &lt; b &amp; &quot;c&quot;</p>");
  });

  it("montre une image seulement quand on lui donne une source", () => {
    const b = blocs("![La mer](piece:f9aa-01)");
    expect(enHtml(b)).toBe("");
    expect(enHtml(b, new Map([["f9aa-01", "data:image/png;base64,AA"]]))).toBe(
      '<figure><img src="data:image/png;base64,AA" alt="La mer"><figcaption>La mer</figcaption></figure>',
    );
  });

  it("imbrique les listes", () => {
    expect(enHtml(blocs("- fruits\n    - pomme"))).toBe(
      "<ul><li>fruits<ul><li>pomme</li></ul></li></ul>",
    );
  });
});

describe("repriseAutour", () => {
  const racine = [
    ...noeudsDepuisMarkdown("Écrit avant tout repère."),
    repere("a", "08:12"),
    ...noeudsDepuisMarkdown("Matin."),
    repere("b", "14:05"),
    ...noeudsDepuisMarkdown("Il était une fois.\n\nFin."),
  ];
  // 0 : avant · 1 : repère a · 2 : Matin · 3 : repère b · 4-5 : l'histoire

  it("rend la reprise du curseur, avec son heure", () => {
    const r = repriseAutour(racine, 5);
    expect(r.heure).toBe("14:05");
    expect(enTexte(blocsDepuisNoeuds(r.noeuds))).toBe("Il était une fois.\n\nFin.");
  });

  it("rattache le texte d'avant le premier repère à la première reprise", () => {
    const r = repriseAutour(racine, 0);
    expect(r.heure).toBe("08:12");
    expect(enTexte(blocsDepuisNoeuds(r.noeuds))).toBe("Écrit avant tout repère.\n\nMatin.");
  });

  it("rend toute la feuille quand il n'y a aucun repère", () => {
    const seul = noeudsDepuisMarkdown("Un.\n\nDeux.");
    expect(repriseAutour(seul, 1)).toEqual({ heure: "", noeuds: seul });
  });
});

describe("ce qu'on dit du passage", () => {
  it("compte les mots, pas la ponctuation", () => {
    expect(compterMots(blocs("Il était — une fois… l'été 1984."))).toBe(6);
  });

  it("liste les pièces sans doublon", () => {
    expect(piecesDe(blocs("![](piece:a1)\n\n![](piece:a1)\n\n![](piece:b2)"))).toEqual([
      "a1",
      "b2",
    ]);
  });

  it("nomme le fichier d'après la première ligne", () => {
    expect(nomDeFichier(blocs("## Le phare : nuit/jour?\n\nTexte."), "pdf")).toBe(
      "Le phare nuitjour.pdf",
    );
    expect(nomDeFichier(blocs("![](piece:a1)"), "docx")).toBe("passage.docx");
  });

  it("coupe un nom trop long à un mot entier", () => {
    const long = "Il était une fois une très longue phrase qui ne voulait jamais finir de s'écrire";
    const nom = nomDeFichier(blocs(long), "png");
    expect(nom.length).toBeLessThanOrEqual(64);
    expect(nom).toBe("Il était une fois une très longue phrase qui ne voulait.png");
  });
});
