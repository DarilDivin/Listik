"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { DecoratorNode } from "lexical";
import type {
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";
import { journalApi } from "./api";
import { poids } from "./poids";
import type { JournalPiece } from "./types";
// Import RELATIF, pas `@/` : vitest ne resout pas l alias, et ce fichier est
// atteint depuis `feuille.test.ts` par la chaine des transformeurs.
import { SWR_KEYS } from "../../lib/swr-config";

export type SerializedPiece = Spread<
  { pieceId: string; legende: string },
  SerializedLexicalNode
>;

/**
 * Une pièce posée dans la journée — une image aujourd'hui.
 *
 * Le nœud ne porte que l'IDENTIFIANT et la légende ; le fichier est retrouvé à
 * l'affichage. Le document reste donc du texte : il se coupe, se recolle et
 * s'enregistre comme le reste, et une image déplacée d'un moment à l'autre
 * n'a aucun lien à réparer derrière elle.
 *
 * En markdown : `![légende](piece:<id>)`. La légende vit là, et non dans une
 * colonne à part — la modifier devient une modification du TEXTE, enregistrée
 * par le même chemin que tout le reste.
 */
export class PieceNode extends DecoratorNode<JSX.Element> {
  __pieceId: string;
  __legende: string;

  static getType(): string {
    return "piece";
  }

  static clone(node: PieceNode): PieceNode {
    return new PieceNode(node.__pieceId, node.__legende, node.__key);
  }

  constructor(pieceId: string, legende: string, key?: NodeKey) {
    super(key);
    this.__pieceId = pieceId;
    this.__legende = legende;
  }

  getPieceId(): string {
    return this.getLatest().__pieceId;
  }

  getLegende(): string {
    return this.getLatest().__legende;
  }

  setLegende(legende: string): void {
    this.getWritable().__legende = legende;
  }

  createDOM(): HTMLElement {
    const dom = document.createElement("figure");
    dom.className = "journal-piece";
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(s: SerializedPiece): PieceNode {
    return new PieceNode(s.pieceId, s.legende);
  }

  exportJSON(): SerializedPiece {
    return {
      ...super.exportJSON(),
      type: "piece",
      version: 1,
      pieceId: this.__pieceId,
      legende: this.__legende,
    };
  }

  /**
   * La LÉGENDE est le texte de cette pièce.
   *
   * C'est ce qui la rend trouvable : la recherche indexe le markdown, où la
   * légende figure. « La terrasse, juste avant qu'il pleuve » doit ramener la
   * photo, pas seulement le paragraphe d'à côté.
   */
  getTextContent(): string {
    return this.__legende;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <PieceVue
        pieceId={this.__pieceId}
        legende={this.__legende}
        onLegende={(texte) => {
          editor.update(() => {
            const n = editor.getEditorState()._nodeMap.get(this.getKey());
            if ($isPieceNode(n)) n.setLegende(texte);
          });
        }}
      />
    );
  }
}

// ---------------------------------------------------------------------------

interface PieceVueProps {
  pieceId: string;
  legende: string;
  onLegende: (texte: string) => void;
}

/**
 * L'image, et sa légende.
 *
 * `IMG_4821.jpg` ne dira rien dans dix ans : le champ de légende est là, vide
 * et discret, sur le papier plutôt que dans une boîte. On écrit, ou on
 * n'écrit pas.
 */
function PieceVue({ pieceId, legende, onLegende }: PieceVueProps) {
  const { data: piece, error } = useSWR(
    SWR_KEYS.JOURNAL_PIECE(pieceId),
    async () => (await journalApi.pieces([pieceId]))[0] ?? null,
    { revalidateOnFocus: false },
  );

  // Le champ de légende n'est pas contrôlé par React : il est
  // `contenteditable`, et le reprendre à chaque frappe replacerait le curseur
  // au début. On ne pose son texte qu'au montage, puis on écoute.
  const champRef = useRef<HTMLElement>(null);
  const [pose, setPose] = useState(false);
  useEffect(() => {
    if (pose || !champRef.current) return;
    champRef.current.textContent = legende;
    setPose(true);
  }, [legende, pose]);

  if (error || piece === null) {
    return (
      <span className="journal-piece-absente">
        Pièce introuvable — le fichier a été déplacé ou effacé.
      </span>
    );
  }

  // Un document se NOMME, il ne se montre pas : il n'y a pas de moteur de
  // rendu par format, et un `.xlsx` affiché serait de toute façon illisible à
  // la taille d'une vignette. La rangée est close par deux filets, comme les
  // Réglages — l'ouvrir passe par la visionneuse du système.
  if (piece && piece.kind !== "image") {
    return <DocumentVue piece={piece} />;
  }

  return (
    <>
      {piece ? (
        // `next/image` n'a rien à faire ici : l'app est un export STATIQUE
        // sans serveur d'optimisation, et la source est un fichier local servi
        // par le protocole `asset` — il n'y a ni réseau à ménager ni format à
        // négocier.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={convertFileSrc(piece.chemin)}
          alt={legende || piece.nom_origine}
          draggable={false}
          className="journal-piece-image"
        />
      ) : (
        <span className="journal-piece-attente" aria-hidden />
      )}
      <figcaption
        ref={champRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="Légende de l'image"
        data-invite="Ajouter une légende…"
        className="journal-piece-legende"
        onInput={(e) => onLegende(e.currentTarget.textContent ?? "")}
      />
    </>
  );
}

/**
 * Un document posé dans la journée : son nom, son poids, et de quoi l'ouvrir.
 *
 * Le nom d'origine plutôt que l'UUID du disque — c'est `bail-signe-2026.pdf`
 * qu'on reconnaît. La taille manque pour les pièces attachées avant que la
 * colonne existe : `poids` rend alors une chaîne vide, et la ligne se contente
 * du nom (voir `poids.ts`).
 */
function DocumentVue({ piece }: { piece: JournalPiece }) {
  const [erreur, setErreur] = useState(false);
  const taille = poids(piece.taille);

  return (
    <button
      type="button"
      className="journal-piece-ligne"
      title={`Ouvrir ${piece.nom_origine}`}
      onClick={() => {
        // La visionneuse du système, pas une nôtre : elle sait déjà ouvrir un
        // PDF, un tableur et un traitement de texte, et elle le fait mieux.
        openPath(piece.chemin).catch(() => setErreur(true));
      }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className="journal-piece-nom">{piece.nom_origine}</span>
      <span className="journal-piece-meta">
        {erreur ? "Impossible à ouvrir" : taille}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------

export function $createPieceNode(pieceId: string, legende = ""): PieceNode {
  return new PieceNode(pieceId, legende);
}

export function $isPieceNode(
  node: LexicalNode | null | undefined,
): node is PieceNode {
  return node instanceof PieceNode;
}
