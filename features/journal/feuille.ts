/**
 * La feuille du jour : un seul document, plusieurs moments.
 *
 * La page-jour est UN éditeur — on y écrit, on y sélectionne et on y supprime
 * d'un bout à l'autre, comme dans n'importe quelle page de notes. Mais elle
 * retient des MOMENTS : chaque reprise d'écriture reste une ligne en base.
 *
 * Les deux vues se raccordent ici, et seulement ici. Dans le document, une
 * reprise commence à un `RepereNode` (hauteur nulle, invisible au clavier) et
 * court jusqu'au suivant. Ce module traduit dans les deux sens — et il le fait
 * SANS DOM, donc c'est vérifiable (`feuille.test.ts`).
 */
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { ElementTransformer } from "@lexical/markdown";
import { type LexicalEditor, type SerializedLexicalNode } from "lexical";
import { RepereNode } from "./RepereNode";
import { $createPieceNode, $isPieceNode, PieceNode } from "./PieceNode";

export const NOEUDS = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
  CodeHighlightNode,
  RepereNode,
  PieceNode,
];

/**
 * Une pièce, en markdown : `![légende](piece:<id>)`.
 *
 * On reste dans la syntaxe d'IMAGE plutôt que d'inventer la nôtre : le contenu
 * du journal doit rester lisible tel quel, et exportable sans traducteur.
 * Seule la CIBLE change — un identifiant au lieu d'un chemin, parce qu'un
 * chemin absolu ne survit ni à une sauvegarde ni à un changement de machine.
 */
const PIECE: ElementTransformer = {
  dependencies: [PieceNode],
  export: (node) =>
    $isPieceNode(node) ? `![${node.getLegende()}](piece:${node.getPieceId()})` : null,
  regExp: /^!\[([^\]]*)\]\(piece:([A-Za-z0-9-]+)\)\s*$/,
  replace: (parent, _enfants, match) => {
    parent.replace($createPieceNode(match[2], match[1]));
  },
  type: "element",
};

/**
 * Les transformeurs de la feuille : ceux de Lexical, plus le nôtre.
 *
 * TOUTE conversion de la page passe par cette liste. En oublier une seule
 * ferait disparaître les images à l'aller-retour — le markdown les rendrait en
 * texte brut, et la reprise perdrait sa photo sans rien dire.
 */
export const TRANSFORMEURS = [PIECE, ...TRANSFORMERS];

/** Une reprise, telle qu'elle vit dans le document. */
export interface Segment {
  /** Identité de la ligne en base. Vide pour une reprise pas encore écrite. */
  entryId: string;
  heure: string;
  markdown: string;
}

/**
 * Un éditeur JETABLE, hors DOM, pour traduire d'une forme à l'autre.
 *
 * `$convertToMarkdownString` sérialise les ENFANTS de la racine : on ne peut
 * pas sérialiser un sous-arbre à la volée. On recompose donc une racine avec
 * les seuls nœuds du segment, et on la lit.
 */
function jetable(): LexicalEditor {
  return createHeadlessEditor({
    nodes: NOEUDS,
    onError: (e) => {
      throw e;
    },
  });
}

/** Markdown courant de l'éditeur (sans repères — il n'en contient pas). */
export function lireMarkdown(editor: LexicalEditor): string {
  let md = "";
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMEURS);
  });
  return md;
}

/** Le markdown d'une reprise, en nœuds sérialisés prêts à être insérés. */
export function noeudsDepuisMarkdown(markdown: string): SerializedLexicalNode[] {
  const e = jetable();
  e.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMEURS);
    },
    { discrete: true },
  );
  // `node.exportJSON()` ne descend PAS dans les enfants — un paragraphe en
  // revient sans son texte. C'est la sérialisation de l'ÉTAT qui fait l'arbre
  // entier.
  return e.getEditorState().toJSON().root.children;
}

/** L'inverse : des nœuds sérialisés vers le markdown qu'ils portent. */
export function markdownDepuisNoeuds(noeuds: SerializedLexicalNode[]): string {
  if (noeuds.length === 0) return "";
  const e = jetable();
  e.setEditorState(
    e.parseEditorState({
      root: {
        children: noeuds,
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    } as never),
  );
  return lireMarkdown(e);
}

type EnCours = { entryId: string; heure: string; noeuds: SerializedLexicalNode[] };

/**
 * Un segment en cours devient une reprise : ses nœuds redeviennent du texte.
 *
 * Les lignes blanches des extrémités tombent. La feuille se termine toujours
 * par un paragraphe vide — l'endroit où l'on écrit — et il n'a rien à faire
 * dans ce qu'on garde : sans ça, la dernière reprise s'enregistrait avec un
 * retour à la ligne de trop, à chaque frappe.
 */
const pose = (c: EnCours): Segment => ({
  entryId: c.entryId,
  heure: c.heure,
  markdown: markdownDepuisNoeuds(c.noeuds).replace(/^\n+/, "").replace(/\n+$/, ""),
});

/**
 * Découpe le document en reprises.
 *
 * Ce qui précède le PREMIER repère rejoint la première reprise : on ne perd
 * jamais du texte parce qu'il a été écrit trop haut. S'il n'y a aucun repère,
 * tout le document forme une reprise sans identité — à l'appelant de lui en
 * donner une.
 */
export function decouperEnSegments(racine: SerializedLexicalNode[]): Segment[] {
  const segments: Segment[] = [];
  let courant: EnCours = {
    entryId: "",
    heure: "",
    noeuds: [],
  };

  for (const n of racine) {
    if (n.type !== "repere") {
      courant.noeuds.push(n);
      continue;
    }
    const repere = n as SerializedLexicalNode & { entryId: string; heure: string };
    if (segments.length === 0 && courant.entryId === "") {
      // Texte écrit AVANT le premier repère : il appartient à la reprise que
      // ce repère ouvre, pas à un moment fantôme.
      courant = { entryId: repere.entryId, heure: repere.heure, noeuds: courant.noeuds };
      continue;
    }
    segments.push(pose(courant));
    courant = { entryId: repere.entryId, heure: repere.heure, noeuds: [] };
  }
  segments.push(pose(courant));
  return segments;
}

/**
 * Un bloc est VIDE quand il ne porte que de la structure : une puce sans
 * texte, un titre sans titre, une citation sans citation.
 *
 * `trim()` ne suffit pas — « - » n'est pas vide pour lui, alors qu'il ne
 * montre rien à l'écran. On voyait donc une puce fantôme survivre.
 *
 * Seuls les marqueurs qui ne portent RIEN par eux-mêmes disparaissent. Un tiret
 * cadratin, des points de suspension ou un emoji restent du contenu.
 */
export function estVide(markdown: string): boolean {
  return markdown.replace(/\d+\.|[-*+>#`\s]/g, "") === "";
}
