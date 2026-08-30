import { describe, expect, it } from "vitest";
import { createHeadlessEditor } from "@lexical/headless";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $getRoot, type LexicalEditor } from "lexical";
import { $aLaMain, couper, estVide, NOEUDS } from "./decoupe";

/** Un éditeur hors DOM, chargé de markdown. */
function editeur(markdown: string): LexicalEditor {
  const e = createHeadlessEditor({
    nodes: NOEUDS,
    onError: (err) => {
      throw err;
    },
  });
  e.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS);
    },
    { discrete: true },
  );
  return e;
}

/** Pose le curseur juste après la première occurrence de `apres`. */
function poser(e: LexicalEditor, apres: string): void {
  e.update(
    () => {
      for (const n of $getRoot().getAllTextNodes()) {
        const i = n.getTextContent().indexOf(apres);
        if (i < 0) continue;
        const fin = i + apres.length;
        n.select(fin, fin);
        return;
      }
      throw new Error(`« ${apres} » introuvable`);
    },
    { discrete: true },
  );
}

const texteRestant = (e: LexicalEditor) =>
  e.getEditorState().read(() => $getRoot().getTextContent());

describe("couper", () => {
  it("coupe en deux moitiés exactes", () => {
    const e = editeur("Un texte entier.");
    poser(e, "Un texte");
    expect(couper(e)).toEqual({ avant: "Un texte", apres: " entier." });
  });

  it("laisse l'éditeur sur la moitié d'AVANT, pas sur le texte entier", () => {
    // Le bloc d'origine rétrécit. S'il gardait le tout à l'écran, il le
    // renvoyait à la première occasion et écrasait la coupe : la page
    // dupliquait au lieu de couper.
    const e = editeur("Un texte entier.");
    poser(e, "Un texte");
    couper(e);
    expect(texteRestant(e)).toBe("Un texte");
  });

  it("en fin de bloc, la seconde moitié est vide", () => {
    const e = editeur("Tout le texte.");
    poser(e, "Tout le texte.");
    expect(couper(e)).toEqual({ avant: "Tout le texte.", apres: "" });
  });

  it("en tête de bloc, c'est la première moitié qui est vide", () => {
    const e = editeur("Tout le texte.");
    e.update(() => $getRoot().selectStart(), { discrete: true });
    expect(couper(e)).toEqual({ avant: "", apres: "Tout le texte." });
  });

  it("sans curseur, crée un bloc vide plutôt que de dupliquer", () => {
    // `EditorState.clone()` remet la sélection à null : c'est ce chemin-là qui
    // rendait deux fois le texte entier, et donc dupliquait le bloc.
    const e = editeur("Un texte entier.");
    expect(couper(e)).toEqual({ avant: "Un texte entier.", apres: "" });
  });

  it("garde le gras de part et d'autre de la coupe", () => {
    const e = editeur("du **gras coupé** ici");
    poser(e, "gras");
    const { avant, apres } = couper(e);
    expect(avant).toBe("du **gras**");
    // L espace reste HORS du gras : "** coupé**" ne serait meme pas du gras.
    expect(apres).toBe(" **coupé** ici");
  });

  it("coupe entre deux paragraphes du même bloc", () => {
    const e = editeur("Premier.\n\nSecond.");
    poser(e, "Premier.");
    expect(couper(e)).toEqual({ avant: "Premier.", apres: "Second." });
  });
});

describe("$aLaMain", () => {
  const dans = (markdown: string, apres: string) => {
    const e = editeur(markdown);
    poser(e, apres);
    return e.getEditorState().read($aLaMain);
  };

  it("rend la main dans une liste à puces", () => {
    expect(dans("- premier\n- deuxieme", "premier")).toBe(true);
  });

  it("rend la main dans une liste numérotée", () => {
    expect(dans("1. un\n2. deux", "un")).toBe(true);
  });

  it("rend la main dans un bloc de code", () => {
    expect(dans("```\nconst x = 1;\n```", "const")).toBe(true);
  });

  it("garde la main dans un paragraphe", () => {
    expect(dans("Un paragraphe.", "Un")).toBe(false);
  });

  it("garde la main dans un titre", () => {
    expect(dans("## Un titre", "Un")).toBe(false);
  });

  it("garde la main dans une citation", () => {
    expect(dans("> Une citation.", "Une")).toBe(false);
  });

  it("garde la main dans le paragraphe qui précède une liste", () => {
    // C'est la POSITION du curseur qui tranche, pas le contenu du bloc : un
    // même bloc peut mêler du texte et une liste.
    expect(dans("Une liste :\n\n- premier", "Une liste")).toBe(false);
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
