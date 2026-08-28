/**
 * Le modèle Lexical de la page-jour : ce qu'on peut décider SANS DOM.
 *
 * La page-jour est une pile de blocs, un éditeur par bloc. Entrée coupe,
 * Retour arrière recolle. Les deux règles qui suivent sont celles qui se sont
 * cassées — elles vivent ici pour être vérifiables (`decoupe.test.ts`).
 */
import { $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { $isListItemNode, ListItemNode, ListNode } from "@lexical/list";
import {
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $convertFromMarkdownString,
} from "@lexical/markdown";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
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
 * Lexical gère-t-il déjà la touche mieux que nous ?
 *
 * Dans une liste, Entrée et Retour arrière servent à la STRUCTURE : puce
 * suivante, sortir de la liste sur une puce vide, désimbriquer. Leur donner le
 * sens « couper / fusionner un bloc » les rendait inutilisables — on ne pouvait
 * plus ajouter d'élément à une liste.
 *
 * Pire, la coupe s'y trompait de cible : `getTopLevelElement` renvoie la liste
 * ENTIÈRE, pas la puce où est le curseur. Les deux moitiés se recouvraient et
 * la liste se dupliquait.
 *
 * C'est la POSITION du curseur qui tranche, pas le contenu du bloc : un même
 * bloc peut mêler un paragraphe et une liste.
 */
export function $aLaMain(): boolean {
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) return false;
  const noeud = sel.anchor.getNode();
  if ($isListItemNode(noeud)) return true;
  if (noeud.getParents().some($isListItemNode)) return true;
  const haut = noeud.getTopLevelElement();
  return haut !== null && $isCodeNode(haut);
}

/**
 * Un bloc ne commence ni ne finit par une ligne blanche.
 *
 * Les ESPACES, eux, restent : couper en plein mot doit rendre « Un texte » et
 * « _entier. » — sinon recoller les deux moitiés ne redonnerait pas l'original.
 */
const sansLignesVides = (md: string) => md.replace(/^\n+/, "").replace(/\n+$/, "");

/**
 * Coupe au curseur et rend les deux moitiés en markdown.
 *
 * `$convertToMarkdownString` sérialise les ENFANTS d'un élément : on ne peut
 * donc pas sérialiser un sous-arbre à la volée. On passe par deux mises à jour
 * JETABLES — couper, supprimer une moitié, lire — en restaurant l'état entre
 * les deux. C'est Lexical qui fait le travail délicat de la coupe, formats
 * compris : couper au milieu d'un mot en gras garde le gras des deux côtés.
 *
 * À la sortie, l'éditeur tient la moitié d'AVANT : c'est le bloc qui reste.
 */
export function couper(editor: LexicalEditor): { avant: string; apres: string } {
  const depart = editor.getEditorState();

  // `EditorState.clone()` sans argument met la sélection à NULL. Restaurer
  // l'état entre les deux moitiés perdait donc le curseur : `insertParagraph`
  // ne coupait rien, les deux moitiés valaient le texte entier, et Entrée
  // DUPLIQUAIT le bloc au lieu d'en créer un vide.
  const curseur = depart.read(() => {
    const sel = $getSelection();
    return $isRangeSelection(sel) ? sel.clone() : null;
  });

  // Sans curseur, on ne coupe pas : on se comporte comme une Entrée en fin de
  // bloc. Échouer en créant un bloc vide vaut mieux qu'en dupliquant.
  if (!curseur) return { avant: lireMarkdown(editor), apres: "" };

  const moitie = (garder: "avant" | "apres"): string => {
    editor.setEditorState(depart.clone(curseur.clone()));
    editor.update(
      () => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        sel.insertParagraph();
        const nouveau = $getSelection();
        if (!$isRangeSelection(nouveau)) return;
        const bloc = nouveau.anchor.getNode().getTopLevelElementOrThrow();
        const i = bloc.getIndexWithinParent();
        const enfants = $getRoot().getChildren();
        const aJeter = garder === "avant" ? enfants.slice(i) : enfants.slice(0, i);
        aJeter.forEach((n) => n.remove());
      },
      { discrete: true },
    );
    return lireMarkdown(editor);
  };

  // `insertParagraph` laisse un paragraphe VIDE du côté qu'on garde quand le
  // curseur était au bord : la moitié commencerait par une ligne blanche.
  // Aucun bloc ne veut d'une ligne blanche à ses extrémités.
  const apres = sansLignesVides(moitie("apres"));
  const avant = sansLignesVides(moitie("avant"));

  // Le bloc qui reste EST la moitié d'avant : on la lui laisse, curseur en
  // bout. Restaurer le texte entier ouvrait une course avec la page — elle
  // écrivait `avant` en base pendant que l'éditeur, encore focalisé (donc
  // ignoré par SyncPlugin), affichait le tout et le renvoyait à la première
  // occasion. Le bloc d'origine ressuscitait entier : la page dupliquait.
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(avant, TRANSFORMERS);
      $getRoot().selectEnd();
    },
    { discrete: true },
  );

  return { avant, apres };
}
