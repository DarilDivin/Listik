import {
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";
import type { TokenKind } from "@/features/omnibar/tokenize";

/**
 * Une couleur par nature d'attribut — mêmes teintes que le surlignage
 * historique, pour que la refonte ne change rien à ce que l'œil a appris.
 */
const NOTE_COLOR = "text-yellow-700/80 dark:text-yellow-200/60";

const TOKEN_CLASS: Record<TokenKind, string> = {
  date: "text-blue-500",
  project: "text-violet-500",
  tag: "text-emerald-500",
  priority: "text-rose-500",
  note: NOTE_COLOR,
  // MÊME couleur que le corps de la note : le marqueur s'en distingue par son
  // halo, pas par sa teinte. Les avoir peints de deux jaunes différents ne
  // servait rien — la note se lisait en deux morceaux.
  // (Le halo est un ::before flouté, il vit dans globals.css : un
  // pseudo-élément ne s'exprime pas en classes utilitaires.)
  noteMarker: `capture-note-marker ${NOTE_COLOR}`,
};

export type SerializedTokenNode = Spread<
  { kind: TokenKind },
  SerializedTextNode
>;

/**
 * Fragment reconnu dans la saisie (date, projet, tag, note), rendu comme un
 * VRAI nœud de l'éditeur plutôt que peint sur un calque.
 *
 * Il étend `TextNode` — et non `DecoratorNode` — à dessein : le fragment reste
 * du texte, donc éditable au clavier (flèches, retour arrière, sélection) et
 * il s'enroule naturellement en fin de ligne. Ce qu'on gagne sur le calque,
 * c'est qu'il existe dans le DOM : il peut être survolé, cliqué et animé, ce
 * qu'un miroir recouvert par un textarea transparent ne permettait pas.
 */
export class TokenNode extends TextNode {
  __kind: TokenKind;

  static getType(): string {
    return "capture-token";
  }

  static clone(node: TokenNode): TokenNode {
    return new TokenNode(node.__text, node.__kind, node.__key);
  }

  constructor(text: string, kind: TokenKind, key?: NodeKey) {
    super(text, key);
    this.__kind = kind;
  }

  getKind(): TokenKind {
    return this.getLatest().__kind;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = TOKEN_CLASS[this.__kind];
    // Lu par la couche d'interaction (clic) et par les tests.
    dom.setAttribute("data-token", this.__kind);
    return dom;
  }

  updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    const replaced = super.updateDOM(prev, dom, config);
    if (!replaced && prev.__kind !== this.__kind) {
      dom.className = TOKEN_CLASS[this.__kind];
      dom.setAttribute("data-token", this.__kind);
    }
    return replaced;
  }

  static importJSON(json: SerializedTokenNode): TokenNode {
    return $createTokenNode(json.text, json.kind);
  }

  exportJSON(): SerializedTokenNode {
    return { ...super.exportJSON(), kind: this.__kind };
  }
}

export function $createTokenNode(text: string, kind: TokenKind): TokenNode {
  return new TokenNode(text, kind);
}

export function $isTokenNode(
  node: LexicalNode | null | undefined,
): node is TokenNode {
  return node instanceof TokenNode;
}
