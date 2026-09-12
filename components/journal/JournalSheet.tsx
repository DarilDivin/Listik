"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
} from "lexical";
import {
  $createRepereNode,
  $isRepereNode,
  type RepereNode,
} from "@/features/journal/RepereNode";
import { $createPieceNode, $isPieceNode } from "@/features/journal/PieceNode";
import { journalApi } from "@/features/journal/api";
import {
  decouperEnSegments,
  NOEUDS,
  noeudsDepuisMarkdown,
  type Segment,
} from "@/features/journal/feuille";
import { cn } from "@/lib/utils";

/** Une reprise à poser dans la feuille. */
export interface Reprise {
  /** Vide pour la reprise en cours, pas encore écrite en base. */
  id: string;
  heure: string;
  markdown: string;
}

const THEME = {
  paragraph: "journal-p",
  quote: "journal-quote",
  heading: { h1: "journal-h1", h2: "journal-h2", h3: "journal-h3" },
  list: {
    ul: "journal-ul",
    ol: "journal-ol",
    listitem: "journal-li",
    nested: { listitem: "journal-li-nested" },
  },
  link: "journal-a",
  text: {
    bold: "font-semibold",
    italic: "italic",
    strikethrough: "line-through",
    code: "journal-code",
  },
  code: "journal-pre",
};

// ---------------------------------------------------------------------------

/** Signature d'une feuille : ce qui la change vraiment, et rien d'autre. */
const empreinte = (reprises: Reprise[]) =>
  reprises.map((r) => `${r.id}\u0000${r.heure}\u0000${r.markdown}`).join("\u0001");

/**
 * Compose le document du jour : les reprises à la suite, chacune ouverte par
 * son repère.
 *
 * La feuille se termine TOUJOURS par un paragraphe vide. C'est là qu'on écrit
 * quand on arrive — il n'y a donc plus de bouton « Écrire… » à part, et plus
 * d'endroit où le clic ne fait rien.
 */
function $poserFeuille(reprises: Reprise[]): void {
  const racine = $getRoot();
  racine.clear();
  for (const r of reprises) {
    racine.append($createRepereNode(r.id, r.heure));
    for (const json of noeudsDepuisMarkdown(r.markdown)) {
      racine.append($parseSerializedNode(json) as LexicalNode);
    }
  }
  const dernier = racine.getLastChild();
  if (dernier === null || $isRepereNode(dernier) || dernier.getTextContent() !== "") {
    racine.append($createParagraphNode());
  }
}

// ---------------------------------------------------------------------------

/**
 * Charge la feuille, et la RECHARGE quand la page la réécrit d'ailleurs (on
 * change de jour, la capture rapide a prolongé une reprise).
 *
 * Jamais pendant qu'on écrit dedans : ce serait remplacer le texte sous le
 * curseur. La feuille en cours de frappe fait foi, et la sauvegarde la portera.
 */
function ChargementPlugin({ reprises }: { reprises: Reprise[] }) {
  const [editor] = useLexicalComposerContext();
  const pose = useRef<string | null>(null);
  const signature = empreinte(reprises);

  useEffect(() => {
    if (pose.current === signature) return;
    const dom = editor.getRootElement();
    // `contains` et non `===` : la légende d'une pièce est un `contenteditable`
    // À ELLE, posé dans un décorateur. Quand on y écrit, le focus n'est plus
    // sur la racine — et comparer à l'identique laissait donc la feuille se
    // reposer sous les doigts, ce qui remontait le décorateur et perdait le
    // curseur à chaque enregistrement.
    //
    // Un changement de JOUR ne passe pas par ici : la page monte la feuille
    // avec `key={day}`, elle est donc entièrement remontée.
    const ecrit = dom !== null && dom.contains(document.activeElement);
    if (ecrit && pose.current !== null) return;
    pose.current = signature;
    // Pas de `discrete: true` : on est dans un effet, et il forcerait un
    // `flushSync` pendant que React rend — l'avertissement était réel.
    editor.update(() => $poserFeuille(reprises));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, editor]);

  return null;
}

// ---------------------------------------------------------------------------

/**
 * Retour arrière collé au début du bloc qui SUIT un repère : le repère
 * disparaît, et les deux reprises n'en font plus qu'une.
 *
 * C'est le seul geste qui touche une frontière, et il ressemble à ce qu'il
 * fait — on recolle deux moments comme on recolle deux paragraphes. Le texte,
 * lui, ne bouge pas d'un caractère.
 */
function FrontierePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (e) => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
          if (sel.anchor.offset !== 0) return false;
          const bloc = sel.anchor.getNode().getTopLevelElement();
          if (bloc === null) return false;
          // Le curseur doit être au tout début du bloc, pas seulement d'un de
          // ses nœuds de texte.
          const premier = bloc.getFirstDescendant();
          const noeud = sel.anchor.getNode();
          if (premier !== null && premier.getKey() !== noeud.getKey()) return false;
          const avant = bloc.getPreviousSibling();
          if (!$isRepereNode(avant)) return false;
          e?.preventDefault();
          editor.update(() => avant.remove());
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  return null;
}

// ---------------------------------------------------------------------------

/**
 * La feuille se termine toujours par un paragraphe vide : sans lui, on ne
 * pourrait plus écrire après une liste ou un bloc de code, et le clic dans le
 * blanc du bas n'aurait nulle part où poser le curseur.
 */
function QueuePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const manque = editorState.read(() => {
          const dernier = $getRoot().getLastChild();
          return (
            dernier === null ||
            $isRepereNode(dernier) ||
            dernier.getTextContent() !== ""
          );
        });
        if (!manque) return;
        editor.update(() => $getRoot().append($createParagraphNode()));
      }),
    [editor],
  );

  return null;
}

// ---------------------------------------------------------------------------

/**
 * Enregistrement continu, par reprise.
 *
 * On ne pousse que ce qui a changé : la feuille est découpée à chaque repère,
 * et la page compare avec ce qu'elle avait. Écrire dans un moment ne réécrit
 * pas les autres.
 */
function SauvegardePlugin({
  onSegments,
}: {
  onSegments: (segments: Segment[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pousser = () => {
      const racine = editor.getEditorState().toJSON().root.children;
      onSegments(decouperEnSegments(racine));
    };

    const stop = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(pousser, 700);
    });

    const dom = editor.getRootElement();
    const surBlur = () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      pousser();
    };
    dom?.addEventListener("blur", surBlur);

    return () => {
      stop();
      dom?.removeEventListener("blur", surBlur);
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [editor, onSegments]);

  return null;
}

// ---------------------------------------------------------------------------

/**
 * La reprise en cours reçoit son identité une fois écrite : le repère sans id
 * n'était qu'une promesse — « ici commence maintenant ».
 */
function IdentitePlugin({ aStamper }: { aStamper: { id: string; heure: string } | null }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!aStamper) return;
    let cle: string | null = null;
    editor.update(() => {
      const vierge = $getRoot()
        .getChildren()
        .find((n): n is RepereNode => $isRepereNode(n) && n.getEntryId() === "");
      if (!vierge) return;
      vierge.setIdentite(aStamper.id, aStamper.heure);
      cle = vierge.getKey();
    });
    if (cle === null) return;
    // LE moment : une marque d'accent affleure dans la gouttière et s'efface.
    // C'est le seul mouvement de la page, et il ne dit qu'une chose : gardé.
    const dom = editor.getElementByKey(cle);
    dom?.classList.add("journal-commit");
    const t = setTimeout(() => dom?.classList.remove("journal-commit"), 1200);
    return () => clearTimeout(t);
  }, [aStamper, editor]);

  return null;
}

/**
 * La feuille porte-t-elle du texte ?
 *
 * On le demande à l'ÉDITEUR et pas aux entrées : entre la première lettre et
 * son enregistrement il y a sept dixièmes de seconde, et l'invitation ne doit
 * pas rester affichée par-dessus ce qu'on écrit.
 */
function VidePlugin({ onVide }: { onVide: (vide: boolean) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const dire = () =>
      onVide(
        editor.getEditorState().read(() => {
          // Une image sans légende ne porte AUCUN texte : s'en tenir au texte
          // faisait passer une journée en photos pour une journée blanche, et
          // l'invitation se dessinait par-dessus les images.
          if ($getRoot().getChildren().some($isPieceNode)) return false;
          return $getRoot().getTextContent() === "";
        }),
      );
    dire();
    return editor.registerUpdateListener(dire);
  }, [editor, onVide]);

  return null;
}

// ---------------------------------------------------------------------------

/** Ce que la page peut demander à la feuille. */
export interface JournalSheetHandle {
  /** Ouvre le sélecteur de fichier et pose l'image au curseur. */
  attacher: () => void;
  /**
   * Pose au curseur une pièce DÉJÀ créée.
   *
   * C'est par là qu'arrive une note vocale : elle s'enregistre dans la page,
   * hors de l'éditeur — la bande qui bouge pendant qu'on parle n'a pas à
   * traverser l'état du document, ni à finir dans le markdown enregistré. Une
   * fois la note faite, il ne reste qu'une pièce à poser, comme les autres.
   */
  poser: (pieceId: string) => void;
}

/**
 * Poser une pièce dans la journée.
 *
 * QUATRE portes : le trombone, le COLLAGE, le glisser-déposer, et `inserer`
 * pour une pièce déjà créée ailleurs (une note vocale enregistrée par la
 * page). Coller reste de loin le geste le plus fréquent pour une capture
 * d'écran.
 *
 * Le glisser-déposer marche PARCE QUE `dragDropEnabled` est à `false` sur la
 * fenêtre principale : Tauri n'intercepte alors pas le drag natif, et WebView2
 * délivre les événements HTML5 — les mêmes dont le réordonnancement des tâches
 * a besoin (voir `docs/ROADMAP-THINGS.md`).
 */
function PiecePlugin({
  poserRef,
  insererRef,
  onErreur,
}: {
  poserRef: RefObject<(() => void) | null>;
  /** Poser une pièce déjà créée — la porte des notes vocales. */
  insererRef: RefObject<((pieceId: string) => void) | null>;
  onErreur: (message: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /** Insère la pièce là où est le curseur, ou au bout à défaut. */
    const inserer = (pieceId: string) => {
      editor.update(() => {
        const noeud = $createPieceNode(pieceId, "");
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          $insertNodeToNearestRoot(noeud);
        } else {
          $getRoot().append(noeud);
        }
      });
    };

    const depuisFichier = async () => {
      try {
        // Ces listes ne font que PRÉ-FILTRER le dialogue : l'autorité reste
        // `db::nature`, qui refuse et le dit. Les tenir à jour ici est un
        // confort, s'en écarter n'ouvre aucune porte.
        const images = ["png", "jpg", "jpeg", "gif", "webp", "avif"];
        const documents = [
          "pdf", "doc", "docx", "odt", "rtf", "txt", "md",
          "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp",
        ];
        const choisi = await open({
          multiple: false,
          filters: [
            { name: "Images et documents", extensions: [...images, ...documents] },
            { name: "Images", extensions: images },
            { name: "Documents", extensions: documents },
          ],
        });
        if (typeof choisi !== "string") return;
        const piece = await journalApi.attacher(choisi);
        inserer(piece.id);
      } catch (e) {
        onErreur(String(e));
      }
    };

    poserRef.current = () => void depuisFichier();
    insererRef.current = inserer;

    /** Le chemin commun au collage et au dépôt : des octets, un nom. */
    const depuisOctets = async (fichier: File) => {
      try {
        const octets = new Uint8Array(await fichier.arrayBuffer());
        // Une capture d'écran n'a pas de nom de fichier : on lui en donne un,
        // avec l'extension que son type MIME annonce — c'est elle qui décide
        // si Rust sait le ranger.
        const ext = (fichier.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
        const nom = fichier.name || `collage.${ext}`;
        const piece = await journalApi.attacherOctets(nom, Array.from(octets));
        inserer(piece.id);
      } catch (e) {
        onErreur(String(e));
      }
    };

    const stopColle = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        // `PASTE_COMMAND` porte trois formes d'événement selon la façon de
        // coller — seule celle qui a un presse-papiers nous concerne.
        if (!(event instanceof ClipboardEvent)) return false;
        const fichier = Array.from(event.clipboardData?.files ?? [])[0];
        // Pas de FICHIER : on rend la main. Coller du texte doit rester du
        // texte, et Lexical le fait mieux que nous. On ne trie pas ici sur le
        // type — c'est `db::nature` qui décide, et lui seul.
        if (!fichier) return false;
        event.preventDefault();
        void depuisOctets(fichier);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    /**
     * Pendant le SURVOL, le navigateur cache le contenu du presse-glisser :
     * `files` est vide par sécurité tant que rien n'est lâché. Seul `types`
     * est lisible, et c'est lui qui dit si des fichiers arrivent.
     */
    const porteUnFichier = (dt: DataTransfer | null) =>
      Array.from(dt?.types ?? []).includes("Files");

    const stopSurvol = editor.registerCommand(
      DRAGOVER_COMMAND,
      (event) => {
        if (!porteUnFichier(event.dataTransfer)) return false;
        // Sans ce `preventDefault`, WebView2 fait ce que fait un navigateur :
        // il QUITTE la page pour afficher le fichier lâché, et l'app est
        // perdue jusqu'au rechargement.
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    const stopDepot = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        const fichier = Array.from(event.dataTransfer?.files ?? [])[0];
        // Pas de fichier : c'est un déplacement INTERNE (un nœud qu'on tire
        // dans le texte). Lexical le fait mieux que nous.
        if (!fichier) return false;
        event.preventDefault();
        // Poser le curseur là où on a lâché : une pièce doit atterrir sous le
        // geste, pas au bout de la journée. Fait tout de suite, pendant qu'on
        // tient les coordonnées — la copie du fichier, elle, prend un moment.
        const portee = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        if (portee) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(portee);
        }
        void depuisOctets(fichier);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      poserRef.current = null;
      insererRef.current = null;
      stopColle();
      stopSurvol();
      stopDepot();
    };
  }, [editor, poserRef, insererRef, onErreur]);

  return null;
}

// ---------------------------------------------------------------------------

interface JournalSheetProps {
  reprises: Reprise[];
  onSegments: (segments: Segment[]) => void;
  /** Identité à poser sur le repère encore vierge, une fois la ligne créée. */
  aStamper: { id: string; heure: string } | null;
  /** Ce qu'on lit quand la journée est encore blanche. */
  invite?: ReactNode;
  /**
   * « page » : la feuille occupe la vue, on y écrit longtemps.
   * « widget » : un aperçu au bas de l'accueil — texte estompé au repos,
   * plafonné, qui défile à l'intérieur plutôt que de pousser la colonne.
   */
  variant?: "page" | "widget";
  /** Prévenir quand une pièce n'a pas pu être posée. */
  onErreurPiece?: (message: string) => void;
  className?: string;
}

/**
 * La feuille du jour : UN éditeur, pas une pile.
 *
 * On y écrit comme dans n'importe quelle page de notes — Entrée fait un
 * paragraphe, Retour arrière recolle, on sélectionne d'un bout à l'autre de la
 * journée. Ce qui distingue un moment du suivant est un repère de hauteur
 * nulle, qui n'affiche que son heure dans la gouttière.
 */
export const JournalSheet = forwardRef<JournalSheetHandle, JournalSheetProps>(
  function JournalSheet(
    { reprises, onSegments, aStamper, invite, variant = "page", onErreurPiece, className },
    ref,
  ) {
  const [vide, setVide] = useState(true);
  // Le plugin y dépose sa fonction : l'éditeur n'existe qu'à l'INTÉRIEUR du
  // composeur, la poignée doit donc être posée depuis là.
  const poserRef = useRef<(() => void) | null>(null);
  const insererRef = useRef<((pieceId: string) => void) | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      attacher: () => poserRef.current?.(),
      poser: (pieceId: string) => insererRef.current?.(pieceId),
    }),
    [],
  );

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "journal-feuille",
        theme: THEME,
        nodes: NOEUDS,
        // La feuille n'est PAS posée ici. Un repère est un DÉCORATEUR, et
        // Lexical rend les décorateurs par un `flushSync` — le créer dans
        // l'état initial le déclenchait pendant que React rendait, ce que
        // React refuse. `ChargementPlugin` la pose dans un effet, après.
        onError: (e) => {
          throw e;
        },
      }}
    >
      <div className={cn("relative", className)}>
        {/* L'invitation se pose PAR-DESSUS la feuille, jamais à sa place :
            elle ne prend pas le clic, et toute la surface reste l'endroit où
            l'on commence à écrire. Elle s'efface à la première lettre. */}
        {invite !== undefined && vide && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 select-none"
          >
            {invite}
          </div>
        )}
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                "journal-prose outline-none",
                variant === "page"
                  ? "min-h-[22vh]"
                  : // Le plafond ne se lève PAS au focus : le widget est ancré
                    // en bas de la colonne, grandir le ferait remonter et le
                    // texte fuirait sous le curseur. Il défile à l'intérieur.
                    //
                    // L'encre, elle, vit dans `globals.css` (`.journal-widget`) :
                    // `.journal-prose` y bat les utilitaires de couleur.
                    "max-h-[var(--journal-plafond)] overflow-hidden focus:overflow-y-auto",
              )}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <ChargementPlugin reprises={reprises} />
        <FrontierePlugin />
        <QueuePlugin />
        <IdentitePlugin aStamper={aStamper} />
        <VidePlugin onVide={setVide} />
        <PiecePlugin
          poserRef={poserRef}
          insererRef={insererRef}
          onErreur={onErreurPiece ?? (() => {})}
        />
        <SauvegardePlugin onSegments={onSegments} />
      </div>
    </LexicalComposer>
  );
  },
);
