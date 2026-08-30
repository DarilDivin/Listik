/**
 * Le modèle Lexical de la page-jour : ce qu'on peut décider SANS DOM.
 *
 * Un bloc est une REPRISE d'écriture, pas un paragraphe — Entrée et Retour
 * arrière appartiennent donc entièrement à Lexical, et la coupe qui vivait ici
 * n'a plus d'objet (voir le commit qui l'a retirée si elle redevient utile).
 */
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getRoot,
  type LexicalEditor,
} from "lexical";

export const NOEUDS = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
  CodeHighlightNode,
];

/** Markdown courant de l'éditeur. */
export function lireMarkdown(editor: LexicalEditor): string {
  let md = "";
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMERS);
  });
  return md;
}

/** Longueur du texte brut — sert à retrouver la jointure après une fusion. */
export function longueurTexte(editor: LexicalEditor): number {
  let n = 0;
  editor.getEditorState().read(() => {
    n = $getRoot().getTextContent().length;
  });
  return n;
}

/**
 * Un bloc est VIDE quand il ne porte que de la structure : une puce sans
 * texte, un titre sans titre, une citation sans citation.
 *
 * `trim()` ne suffit pas — « - » n'est pas vide pour lui, alors qu'il ne
 * montre rien à l'écran. On voyait donc une puce fantôme survivre au blur,
 * avec la ligne « Écrire… » revenue juste dessous.
 *
 * Seuls les marqueurs qui ne portent RIEN par eux-mêmes disparaissent. Un tiret
 * cadratin, des points de suspension ou un emoji restent du contenu.
 */
export function estVide(markdown: string): boolean {
  return markdown.replace(/\d+\.|[-*+>#`\s]/g, "") === "";
}
