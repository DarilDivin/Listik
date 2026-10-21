"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { $generateJSONFromSelectedNodes } from "@lexical/clipboard";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $parseSerializedNode,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
  type SerializedLexicalNode,
} from "lexical";
import { repriseAutour } from "@/features/journal/passage";
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
  peutRecharger,
  type EtatFeuille,
  type Segment,
} from "@/features/journal/feuille";
import { cn } from "@/lib/utils";

/**
 * Étiquette des mises à jour faites PAR LE PROGRAMME (poser la feuille,
 * estampiller un repère) : ce ne sont pas des frappes. La sauvegarde et la
 * détection de frappe les ignorent.
 */
const TAG_PROGRAMME = "journal-programme";

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
 * Elle ne refuse que si quelqu'un ÉCRIT vraiment dedans (curseur dans
 * l'éditeur, fenêtre au premier plan, une frappe depuis le dernier chargement) :
 * remplacer le texte sous le curseur est le seul cas à éviter, la feuille en
 * cours de frappe fait alors foi et la sauvegarde la portera. Voir
 * `peutRecharger`.
 */
/**
 * La fenêtre a-t-elle le focus du SYSTÈME ?
 *
 * `document.hasFocus()` ne le dit pas dans WebView2 : mesuré, il reste vrai
 * dans la page quand la barre rapide passe au premier plan. Tauri, lui,
 * rapporte le focus réel de la fenêtre. On part de « oui » : dans le doute,
 * la feuille ne se recharge pas sous les doigts.
 */
function useFenetreActive(surPerte: () => void): RefObject<boolean> {
  const actif = useRef(true);
  const surPerteRef = useRef(surPerte);
  surPerteRef.current = surPerte;
  useEffect(() => {
    let vivant = true;
    const fenetre = getCurrentWindow();
    void fenetre
      .isFocused()
      .then((f) => {
        if (vivant) actif.current = f;
      })
      .catch(() => {});
    const arret = fenetre.onFocusChanged(({ payload }) => {
      actif.current = payload;
      if (!payload) surPerteRef.current();
    });
    return () => {
      vivant = false;
      void arret.then((stop) => stop()).catch(() => {});
    };
  }, []);
  return actif;
}

function ChargementPlugin({
  reprises,
  afficheesRef,
  basesRef,
  enAttenteRef,
  occupe,
}: {
  reprises: Reprise[];
  afficheesRef: RefObject<Set<string>>;
  basesRef: RefObject<Map<string, string>>;
  /** Un enregistrement attend son minuteur (voir `SauvegardePlugin`). */
  enAttenteRef: RefObject<boolean>;
  /** Un enregistrement est parti et n'est pas revenu. */
  occupe: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  // Un chargement refusé pendant la frappe est retenté quand on cesse d'écrire
  // ici : on quitte l'éditeur, ou la fenêtre perd le focus. Sans ça, la
  // feuille restait périmée jusqu'au changement suivant de la base.
  const [relance, setRelance] = useState(0);
  const fenetreActive = useFenetreActive(() => setRelance((n) => n + 1));
  const pose = useRef<string | null>(null);
  // Vrai dès qu'une vraie frappe a eu lieu depuis la dernière pose. Les mises à
  // jour du programme (`TAG_PROGRAMME`) n'en sont pas : sans cette distinction,
  // poser la feuille se prendrait elle-même pour quelqu'un qui écrit.
  const tapeRef = useRef(false);
  const signature = empreinte(reprises);

  useEffect(
    () =>
      editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
        if (tags.has(TAG_PROGRAMME)) return;
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) tapeRef.current = true;
      }),
    [editor],
  );

  useEffect(
    () =>
      editor.registerRootListener((racine) => {
        const relancer = () => setRelance((n) => n + 1);
        racine?.addEventListener("focusout", relancer);
        return () => racine?.removeEventListener("focusout", relancer);
      }),
    [editor],
  );

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
    //
    // Le curseur seul ne dit pas qu'on écrit : il reste dans l'éditeur quand la
    // FENÊTRE passe en arrière-plan (on écrit alors ailleurs, ex. Alt+Q), et on
    // peut aussi poser le curseur sans rien taper. On ne refuse donc que si la
    // fenêtre est au premier plan ET qu'une frappe a eu lieu depuis la pose.
    const curseurDedans = dom !== null && dom.contains(document.activeElement);
    const ok = peutRecharger({
      dejaPosee: pose.current !== null,
      curseurDedans,
      fenetreActive: fenetreActive.current,
      tapeDepuisPose: tapeRef.current,
      enregistrementEnCours: occupe || enAttenteRef.current,
    });
    if (!ok) return;
    pose.current = signature;
    tapeRef.current = false;
    // Ce que la feuille montre désormais : seules ces entrées-là pourront être
    // effacées par une sauvegarde (voir `entreesASupprimer`), et c'est contre
    // ce texte-là que Rust arbitrera les prochaines écritures (`bases`).
    afficheesRef.current = new Set(reprises.map((r) => r.id).filter((id) => id !== ""));
    basesRef.current.clear();
    for (const r of reprises) if (r.id !== "") basesRef.current.set(r.id, r.markdown);
    // Pas de `discrete: true` : on est dans un effet, et il forcerait un
    // `flushSync` pendant que React rend — l'avertissement était réel.
    editor.update(
      () => {
        $poserFeuille(reprises);
        // Le curseur était là : on le remet au bout, où l'on reprend d'écrire.
        if (curseurDedans) $getRoot().selectEnd();
      },
      { tag: TAG_PROGRAMME },
    );
    // Un chargement n'est pas un geste à annuler : sans ça, Ctrl+Z ramènerait
    // la feuille d'avant le rechargement, et la sauvegarde suivante l'écrirait
    // par-dessus le texte plus récent.
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    // `occupe` : un enregistrement qui revient peut débloquer une pose refusée ;
    // `relance` : on a cessé d'écrire ici (voir plus haut).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, editor, occupe, relance]);

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
  enAttenteRef,
}: {
  onSegments: (segments: Segment[]) => void;
  enAttenteRef: RefObject<boolean>;
}) {
  const [editor] = useLexicalComposerContext();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La dernière version, sans se réabonner : l'hôte en passe une nouvelle à
  // chaque rendu, et se réabonner effaçait le minuteur en attente.
  const onSegmentsRef = useRef(onSegments);
  onSegmentsRef.current = onSegments;

  useEffect(() => {
    const pousser = () => {
      // Remis à null EN sonnant : c'est ce qui dit à `surBlur` qu'il n'y a
      // plus rien en attente. Un `ReturnType<typeof setTimeout>` qui a sonné
      // reste un nombre « vrai » pour toujours si personne ne l'efface — voir
      // plus bas pourquoi ça a fait doubler des reprises.
      minuteur.current = null;
      enAttenteRef.current = false;
      const racine = editor.getEditorState().toJSON().root.children;
      onSegmentsRef.current(decouperEnSegments(racine));
    };

    const stop = editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
      // Poser la feuille n'est pas écrire : l'enregistrer pousserait vers la
      // base un contenu qui peut déjà être périmé.
      if (tags.has(TAG_PROGRAMME)) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (minuteur.current) clearTimeout(minuteur.current);
      enAttenteRef.current = true;
      minuteur.current = setTimeout(pousser, 700);
    });

    const dom = editor.getRootElement();
    /**
     * Rien en attente : déjà poussé par le minuteur, ou rien à pousser.
     *
     * Sans cette garde, un blur arrivant APRÈS que le minuteur ait sonné
     * repoussait quand même — avant que la feuille ait eu le temps de se
     * reposer avec le vrai id (bloqué tant qu'on a le focus, voir
     * `ChargementPlugin`), `enregistrer` revoyait un segment sans id et
     * créait une DEUXIÈME entrée avec le même texte. Repro : écrire, laisser
     * passer 700 ms, cliquer ailleurs.
     */
    const surBlur = () => {
      if (!minuteur.current) return;
      clearTimeout(minuteur.current);
      minuteur.current = null;
      pousser();
    };
    dom?.addEventListener("blur", surBlur);

    return () => {
      stop();
      dom?.removeEventListener("blur", surBlur);
      // Fermer la barre rapide ou quitter la page ne doit pas perdre les
      // dernières frappes : ce qui attendait part maintenant.
      if (minuteur.current) {
        clearTimeout(minuteur.current);
        pousser();
      }
    };
  }, [editor, enAttenteRef]);

  return null;
}

// ---------------------------------------------------------------------------

/**
 * Le texte du repère vierge a été FONDU par Rust dans le moment encore ouvert
 * (voir `useFeuille`) : on retire ce repère, et son texte rejoint le moment
 * d'avant — exactement ce que la base contient. Garder le repère faisait
 * renvoyer ce texte à fondre à chaque sauvegarde : il se répétait.
 */
function FondrePlugin({ aFondre }: { aFondre: number }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (aFondre === 0) return;
    editor.update(
      () => {
        $getRoot()
          .getChildren()
          .find((n): n is RepereNode => $isRepereNode(n) && n.getEntryId() === "")
          ?.remove();
      },
      { tag: TAG_PROGRAMME },
    );
  }, [aFondre, editor]);

  return null;
}

/**
 * Pose le curseur au BOUT de la feuille, par Lexical lui-même. Une plage DOM
 * posée de l'extérieur (`selectNodeContents`) était ignorée : Lexical gardait
 * sa propre sélection, et on écrivait au tout début de la journée.
 */
function FocusPlugin({ focusRef }: { focusRef: RefObject<(() => void) | null> }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    focusRef.current = () =>
      editor.focus(
        () => editor.update(() => $getRoot().selectEnd(), { tag: TAG_PROGRAMME }),
        { defaultSelection: "rootEnd" },
      );
    return () => {
      focusRef.current = null;
    };
  }, [editor, focusRef]);

  return null;
}

// ---------------------------------------------------------------------------

/**
 * La reprise en cours reçoit son identité une fois écrite : le repère sans id
 * n'était qu'une promesse — « ici commence maintenant ».
 */
function IdentitePlugin({
  aStamper,
  afficheesRef,
}: {
  aStamper: { id: string; heure: string } | null;
  afficheesRef: RefObject<Set<string>>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!aStamper) return;
    let cle: string | null = null;
    editor.update(
      () => {
        const vierge = $getRoot()
          .getChildren()
          .find((n): n is RepereNode => $isRepereNode(n) && n.getEntryId() === "");
        if (!vierge) return;
        vierge.setIdentite(aStamper.id, aStamper.heure);
        cle = vierge.getKey();
      },
      { tag: TAG_PROGRAMME },
    );
    if (cle === null) return;
    // Écrite ici : la feuille la montre, elle peut donc aussi l'effacer. Mais
    // seulement une fois le repère vraiment estampillé : une entrée annoncée
    // « affichée » alors qu'aucun repère ne l'a reçue serait effacée par la
    // sauvegarde suivante (voir `entreesASupprimer`), texte compris.
    afficheesRef.current.add(aStamper.id);
    // LE moment : une marque d'accent affleure dans la gouttière et s'efface.
    // C'est le seul mouvement de la page, et il ne dit qu'une chose : gardé.
    const dom = editor.getElementByKey(cle);
    dom?.classList.add("journal-commit");
    const t = setTimeout(() => dom?.classList.remove("journal-commit"), 1200);
    return () => clearTimeout(t);
  }, [aStamper, editor, afficheesRef]);

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
  /** Pose le curseur au bout de la feuille, prêt à continuer d'écrire. */
  focusFin: () => void;
  /** Ce qui peut partir à l'export d'un passage — voir `Portees`. */
  portees: () => Portees | null;
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

/**
 * Ce qu'on peut faire partir de la feuille : la sélection, la reprise où se
 * trouve le curseur, ou la page entière. Les nœuds sont SÉRIALISÉS — une copie
 * figée, que l'export lit sans toucher à l'éditeur.
 */
export interface Portees {
  /** Vide quand rien n'est sélectionné (un simple curseur ne compte pas). */
  selection: SerializedLexicalNode[] | null;
  /** Vide quand la feuille n'a jamais eu de curseur. */
  reprise: { heure: string; noeuds: SerializedLexicalNode[] } | null;
  page: SerializedLexicalNode[];
  /** Combien de moments la page compte — un seul, et « ce passage » EST la page. */
  moments: number;
}

/**
 * Lit les portées à la demande.
 *
 * La sélection de Lexical survit à la perte du focus : elle reste dans l'état
 * de l'éditeur. Mais la page la lit quand même AVANT que le menu prenne le
 * focus (au `pointerdown`) — on ne parie pas sur ce qu'un menu fait de la
 * sélection en s'ouvrant.
 */
function PassagePlugin({ lireRef }: { lireRef: RefObject<(() => Portees) | null> }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    lireRef.current = () => {
      const page = editor.getEditorState().toJSON().root.children;
      return editor.read(() => {
        const sel = $getSelection();
        const selection =
          $isRangeSelection(sel) && !sel.isCollapsed()
            ? $generateJSONFromSelectedNodes(editor, sel).nodes
            : null;

        // Le bloc du curseur, à la racine. Un curseur posé ENTRE deux blocs
        // (sur la racine même) désigne l'enfant à son décalage.
        let bloc: LexicalNode | null = null;
        if ($isRangeSelection(sel)) {
          const n = sel.anchor.getNode();
          bloc = $isRootNode(n)
            ? n.getChildAtIndex(Math.min(sel.anchor.offset, n.getChildrenSize() - 1))
            : n.getTopLevelElement();
        } else if ($isNodeSelection(sel)) {
          bloc = sel.getNodes()[0]?.getTopLevelElement() ?? null;
        }
        const reprise = bloc ? repriseAutour(page, bloc.getIndexWithinParent()) : null;

        return {
          selection,
          reprise,
          page,
          moments: Math.max(1, page.filter((n) => n.type === "repere").length),
        };
      });
    };
    return () => {
      lireRef.current = null;
    };
  }, [editor, lireRef]);

  return null;
}

// ---------------------------------------------------------------------------

interface JournalSheetProps {
  reprises: Reprise[];
  /** La feuille a changé ; avec ce qu'elle a posé et ce qu'elle montre (voir `EtatFeuille`). */
  onSegments: (segments: Segment[], etat: EtatFeuille) => void;
  /** Identité à poser sur le repère encore vierge, une fois la ligne créée. */
  aStamper: { id: string; heure: string } | null;
  /** Augmente quand le texte du repère vierge a été fondu dans le moment d'avant. */
  aFondre?: number;
  /** Un enregistrement est parti et n'est pas revenu : on ne recharge pas. */
  occupe?: boolean;
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
    {
      reprises,
      onSegments,
      aStamper,
      aFondre = 0,
      occupe = false,
      invite,
      variant = "page",
      onErreurPiece,
      className,
    },
    ref,
  ) {
  const [vide, setVide] = useState(true);
  // Le plugin y dépose sa fonction : l'éditeur n'existe qu'à l'INTÉRIEUR du
  // composeur, la poignée doit donc être posée depuis là.
  const poserRef = useRef<(() => void) | null>(null);
  const insererRef = useRef<((pieceId: string) => void) | null>(null);
  const lirePorteesRef = useRef<(() => Portees) | null>(null);
  const afficheesRef = useRef<Set<string>>(new Set());
  const basesRef = useRef<Map<string, string>>(new Map());
  const enAttenteRef = useRef(false);
  const focusRef = useRef<(() => void) | null>(null);
  // Le plugin de sauvegarde garde la dernière version de cette fonction dans un
  // ref : elle peut changer à chaque rendu sans qu'il se réabonne.
  const pousserSegments = useCallback(
    (segments: Segment[]) =>
      onSegments(segments, { affichees: afficheesRef.current, bases: basesRef.current }),
    [onSegments],
  );
  useImperativeHandle(
    ref,
    () => ({
      attacher: () => poserRef.current?.(),
      poser: (pieceId: string) => insererRef.current?.(pieceId),
      focusFin: () => focusRef.current?.(),
      portees: () => lirePorteesRef.current?.() ?? null,
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
        <ChargementPlugin
          reprises={reprises}
          afficheesRef={afficheesRef}
          basesRef={basesRef}
          enAttenteRef={enAttenteRef}
          occupe={occupe}
        />
        <FrontierePlugin />
        <QueuePlugin />
        <IdentitePlugin aStamper={aStamper} afficheesRef={afficheesRef} />
        <FondrePlugin aFondre={aFondre} />
        <FocusPlugin focusRef={focusRef} />
        <VidePlugin onVide={setVide} />
        <PiecePlugin
          poserRef={poserRef}
          insererRef={insererRef}
          onErreur={onErreurPiece ?? (() => {})}
        />
        <SauvegardePlugin onSegments={pousserSegments} enAttenteRef={enAttenteRef} />
        <PassagePlugin lireRef={lirePorteesRef} />
      </div>
    </LexicalComposer>
  );
  },
);
