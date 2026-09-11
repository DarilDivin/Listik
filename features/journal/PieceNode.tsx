"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { assurerApercu } from "./apercu";
import { palette, peindreBande } from "./halo";
import { poids } from "./poids";
import { minutage } from "./voix";
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
 * La pièce, sous la forme que sa NATURE appelle.
 *
 * Une photo se regarde en grand ; un PDF se pose comme une feuille, à sa vraie
 * proportion ; le reste se nomme. Le nœud, lui, ne sait rien de tout ça — il
 * ne porte qu'un identifiant, et c'est ici que le fichier redevient quelque
 * chose à voir.
 */
function PieceVue({ pieceId, legende, onLegende }: PieceVueProps) {
  const { data: piece, error, mutate: revalider } = useSWR(
    SWR_KEYS.JOURNAL_PIECE(pieceId),
    async () => (await journalApi.pieces([pieceId]))[0] ?? null,
    { revalidateOnFocus: false },
  );

  // La vignette d'un PDF se fait ICI, à l'affichage, quand elle manque — et
  // non au moment d'attacher. C'est ce qui la rend rattrapable : un PDF joint
  // pendant que l'app redémarrait resterait sinon une rangée nue pour
  // toujours, sans rien pour le dire.
  useEffect(() => {
    if (!piece) return;
    void assurerApercu(piece).then((fait) => {
      if (fait) void revalider();
    });
  }, [piece, revalider]);

  if (error || piece === null) {
    return (
      <span className="journal-piece-absente">
        Pièce introuvable — le fichier a été déplacé ou effacé.
      </span>
    );
  }

  if (piece && piece.kind === "voix") {
    // Sans silhouette il n'y a rien à dessiner — une note enregistrée par une
    // version antérieure, ou dont les crêtes n'ont pas pu être lues. Elle
    // retombe sur la rangée nue et s'écoute quand même : la visionneuse du
    // système sait ouvrir un WebM.
    return piece.cretes && piece.cretes.length > 0 ? (
      <OndeVocale piece={piece} legende={legende} onLegende={onLegende} />
    ) : (
      <LigneDocument piece={piece} />
    );
  }

  if (piece && piece.kind !== "image") {
    // Un PDF dont on a rendu la première page se POSE comme une feuille : on
    // reconnaît un document sans lui donner le poids d'une photo. Les autres
    // se nomment — il n'y a pas de moteur de rendu par format, et un `.xlsx`
    // serait de toute façon illisible à cette taille.
    return piece.apercu ? (
      <FeuillePosee piece={piece} legende={legende} onLegende={onLegende} />
    ) : (
      <LigneDocument piece={piece} />
    );
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
      <Legende texte={legende} onTexte={onLegende} />
    </>
  );
}

/**
 * Le champ de légende, partagé par la photo et la feuille posée.
 *
 * `IMG_4821.jpg` ne dira rien dans dix ans : le champ est là, vide et discret,
 * sur le papier plutôt que dans une boîte. On écrit, ou on n'écrit pas.
 *
 * Il n'est PAS contrôlé par React : c'est un `contenteditable`, et lui
 * reprendre son texte à chaque frappe replacerait le curseur au début. On ne
 * pose son contenu qu'au montage, puis on écoute.
 */
function Legende({
  texte,
  onTexte,
}: {
  texte: string;
  onTexte: (t: string) => void;
}) {
  const champRef = useRef<HTMLElement>(null);
  const [pose, setPose] = useState(false);
  useEffect(() => {
    if (pose || !champRef.current) return;
    champRef.current.textContent = texte;
    setPose(true);
  }, [texte, pose]);

  return (
    <figcaption
      ref={champRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Légende de la pièce"
      data-invite="Ajouter une légende…"
      className="journal-piece-legende"
      onInput={(e) => onTexte(e.currentTarget.textContent ?? "")}
    />
  );
}

/** « 12 pages · 1,4 Mo » — et seulement ce qu'on sait vraiment. */
function apposition(piece: JournalPiece): string {
  const bouts = [
    piece.pages ? `${Number(piece.pages)} page${Number(piece.pages) > 1 ? "s" : ""}` : "",
    poids(piece.taille),
  ].filter(Boolean);
  return bouts.join(" · ");
}

/**
 * Un PDF, sa première page debout dans la colonne, le nom à côté.
 *
 * À sa vraie proportion, et non à la largeur d'une photo : un contrat de
 * douze pages n'a pas à occuper l'écran comme un paysage. On le reconnaît,
 * c'est tout ce qu'on lui demande — pour le lire, on l'ouvre.
 */
function FeuillePosee({
  piece,
  legende,
  onLegende,
}: {
  piece: JournalPiece;
  legende: string;
  onLegende: (t: string) => void;
}) {
  return (
    <span className="journal-piece-posee">
      <button
        type="button"
        className="journal-piece-feuille"
        title={`Ouvrir ${piece.nom_origine}`}
        onClick={() => void openPath(piece.chemin).catch(() => {})}
      >
        {/* Voir la note sur `next/image` plus haut : export statique, fichier
            local servi par le protocole `asset`. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={convertFileSrc(piece.apercu!)} alt="" draggable={false} />
      </button>
      <span className="journal-piece-a-cote">
        <span className="journal-piece-nom">{piece.nom_origine}</span>
        <span className="journal-piece-meta">{apposition(piece)}</span>
        <Legende texte={legende} onTexte={onLegende} />
      </span>
    </span>
  );
}

/**
 * Une voix dans la journée : sa lueur, et de quoi l'écouter.
 *
 * La forme n'est pas une décoration. C'est ce qui distingue deux notes
 * d'affilée — l'une brève et hachée, l'autre longue et posée — là où deux
 * rangées « note-vocale-14h32.webm » se ressembleraient trait pour trait. On
 * retrouve un enregistrement à sa forme comme on retrouve une photo à ce
 * qu'elle montre.
 *
 * C'est la MÊME matière qu'à l'enregistrement, étirée sur la durée : ce qu'on
 * a écouté s'allume, le reste attend sous un voile. Un seul langage du début
 * à la fin, plutôt qu'un halo pour parler et des barres pour réécouter.
 *
 * Les crêtes viennent de la BASE, mesurées pendant qu'on parlait : les
 * recalculer ici demanderait de décoder tout l'audio à chaque ouverture de la
 * journée, pour dessiner une vignette.
 */
function OndeVocale({
  piece,
  legende,
  onLegende,
}: {
  piece: JournalPiece;
  legende: string;
  onLegende: (t: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const toileRef = useRef<HTMLCanvasElement>(null);
  const [joue, setJoue] = useState(false);
  const [avance, setAvance] = useState(0);

  // Mémorisé : `?? []` rendrait un tableau NEUF à chaque rendu, et l'effet de
  // dessin plus bas rebrancherait ses observateurs à chaque fois.
  const cretes = useMemo(() => piece.cretes ?? [], [piece.cretes]);
  // La durée MESURÉE, jamais `audio.duration` : un WebM de `MediaRecorder`
  // n'en porte pas dans son en-tête et répond `Infinity`. Toute la barre de
  // progression en dépend.
  const dureeMs = Number(piece.duree_ms ?? 0);

  // Aucune boucle d'animation ici : une note gardée ne bouge pas. On repeint
  // quand la lecture avance, quand la colonne change de largeur, et quand le
  // thème ou l'accent change — pas soixante fois par seconde pour des pixels
  // immobiles. Une journée à quatre notes vocales paierait le reste en
  // batterie, pour rien.
  useEffect(() => {
    const toile = toileRef.current;
    if (!toile || cretes.length === 0) return;
    const peindre = () => peindreBande(toile, palette(), cretes, avance);
    peindre();

    const surTaille = new ResizeObserver(peindre);
    surTaille.observe(toile);
    // La palette est mise en cache dans `halo.ts` et invalidée par le même
    // changement d'attribut : il suffit de redemander un dessin.
    const surTheme = new MutationObserver(peindre);
    surTheme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent"],
    });
    return () => {
      surTaille.disconnect();
      surTheme.disconnect();
    };
  }, [cretes, avance]);

  const basculer = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  };

  return (
    <span className="journal-piece-voix">
      <button
        type="button"
        className="journal-voix-bouton"
        aria-label={joue ? "Mettre en pause" : "Écouter la note"}
        onClick={basculer}
      >
        {joue ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
            <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7.5 4.8a1 1 0 0 1 1.53-.85l10 7.2a1 1 0 0 1 0 1.7l-10 7.2A1 1 0 0 1 7.5 19.2z" />
          </svg>
        )}
      </button>

      <span className="journal-voix-corps">
        <button
          type="button"
          className="journal-voix-onde"
          aria-label="Se déplacer dans la note"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || dureeMs <= 0) return;
            const boite = e.currentTarget.getBoundingClientRect();
            const part = Math.min(1, Math.max(0, (e.clientX - boite.left) / boite.width));
            audio.currentTime = (part * dureeMs) / 1000;
            setAvance(part);
          }}
        >
          {/* Le bouton reste un BOUTON : c'est lui qui porte le déplacement
              au clic et l'anneau de focus. Un canvas seul ne se focalise
              pas, et la lueur n'a rien à intercepter. */}
          <canvas ref={toileRef} className="journal-voix-lueur" aria-hidden />
        </button>
        <Legende texte={legende} onTexte={onLegende} />
      </span>

      <span className="journal-voix-duree">
        {minutage(joue || avance > 0 ? avance * dureeMs : dureeMs)}
      </span>

      {/* Pas de `controls` : la barre du navigateur afficherait une durée
          `Infinity` et une glissière inutilisable — c'est justement le défaut
          qu'on contourne. */}
      <audio
        ref={audioRef}
        src={convertFileSrc(piece.chemin)}
        preload="metadata"
        onPlay={() => setJoue(true)}
        onPause={() => setJoue(false)}
        onEnded={() => {
          setJoue(false);
          setAvance(0);
        }}
        onTimeUpdate={(e) => {
          if (dureeMs > 0) {
            setAvance(Math.min(1, (e.currentTarget.currentTime * 1000) / dureeMs));
          }
        }}
      />
    </span>
  );
}

/**
 * Un document qui ne s'aperçoit pas : son nom, son poids, et de quoi l'ouvrir.
 *
 * Une rangée close par deux filets, l'idiome des Réglages — pas une carte
 * posée sur la page, une ligne DE la page. Le nom d'origine plutôt que l'UUID
 * du disque : c'est `bail-signe-2026.pdf` qu'on reconnaît. La taille manque
 * pour les pièces attachées avant que la colonne existe, et `poids` rend
 * alors une chaîne vide (voir `poids.ts`).
 */
function LigneDocument({ piece }: { piece: JournalPiece }) {
  const [erreur, setErreur] = useState(false);
  const meta = apposition(piece);

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
        {erreur ? "Impossible à ouvrir" : meta}
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
