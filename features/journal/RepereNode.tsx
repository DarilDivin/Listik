"use client";

import { DecoratorNode } from "lexical";
import type {
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

export type SerializedRepere = Spread<
  { entryId: string; heure: string },
  SerializedLexicalNode
>;

/**
 * Le repère d'une REPRISE d'écriture, posé dans la feuille du jour.
 *
 * La page-jour est UN document — un seul éditeur, où l'on écrit, sélectionne
 * et supprime d'un bout à l'autre. Mais elle retient des moments : ce nœud
 * marque l'endroit où une reprise commence, et porte l'identité de la ligne en
 * base qui la conservera.
 *
 * Il ne prend AUCUNE place dans le flux (hauteur nulle) et n'affiche que son
 * heure, dans la gouttière. C'est la seule chose qui distingue une reprise de
 * la suivante — le texte, lui, coule sans couture.
 *
 * Il est isolé et non sélectionnable au clavier : le curseur ne doit jamais
 * pouvoir s'y poser, sinon la page aurait une position morte entre chaque
 * moment. Le SEUL geste qui le concerne est Retour arrière collé au début du
 * bloc qui le suit — il disparaît alors, et les deux reprises n'en font plus
 * qu'une.
 */
export class RepereNode extends DecoratorNode<JSX.Element> {
  __entryId: string;
  __heure: string;

  static getType(): string {
    return "repere";
  }

  static clone(node: RepereNode): RepereNode {
    return new RepereNode(node.__entryId, node.__heure, node.__key);
  }

  constructor(entryId: string, heure: string, key?: NodeKey) {
    super(key);
    this.__entryId = entryId;
    this.__heure = heure;
  }

  getEntryId(): string {
    return this.getLatest().__entryId;
  }

  /** L'identité arrive APRÈS coup pour une reprise née dans l'éditeur. */
  setIdentite(id: string, heure: string): void {
    const w = this.getWritable();
    w.__entryId = id;
    w.__heure = heure;
  }

  getHeure(): string {
    return this.getLatest().__heure;
  }

  createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "journal-repere";
    // Le repère ne se sélectionne pas à la souris non plus : cliquer à côté de
    // l'heure doit poser le curseur dans le texte, pas sur le repère.
    dom.setAttribute("contenteditable", "false");
    dom.setAttribute("aria-hidden", "true");
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    // Rien à exporter : un repère n'est pas du contenu, c'est une frontière.
    return { element: null };
  }

  static importJSON(serialized: SerializedRepere): RepereNode {
    return new RepereNode(serialized.entryId, serialized.heure);
  }

  exportJSON(): SerializedRepere {
    return {
      ...super.exportJSON(),
      type: "repere",
      version: 1,
      entryId: this.__entryId,
      heure: this.__heure,
    };
  }

  /** Une frontière ne porte pas de texte — surtout pas son heure. */
  getTextContent(): string {
    return "";
  }

  isInline(): false {
    return false;
  }

  /** Le curseur ne doit jamais entrer ici. */
  isIsolated(): true {
    return true;
  }

  isKeyboardSelectable(): false {
    return false;
  }

  decorate(): JSX.Element {
    // Tant que la reprise n'a pas d'identité, elle ne garde rien : afficher son
    // heure ferait croire à un moment vide au bas de la page. Elle apparaît
    // quand la première phrase est enregistrée — c'est LE moment.
    if (this.__entryId === "") return <></>;
    return <span className="journal-repere-heure">{this.__heure}</span>;
  }
}

export function $createRepereNode(entryId: string, heure: string): RepereNode {
  return new RepereNode(entryId, heure);
}

export function $isRepereNode(
  node: LexicalNode | null | undefined,
): node is RepereNode {
  return node instanceof RepereNode;
}
