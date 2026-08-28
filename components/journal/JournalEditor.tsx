"use client";

import { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from "lexical";
import { cn } from "@/lib/utils";

/** Où poser le curseur quand la page rend la main à ce bloc. */
export type Caret = "start" | "end" | "junction";

const NOEUDS = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
  CodeHighlightNode,
];

/**
 * Le thème pointe vers les MÊMES classes que `.note-markdown` stylise déjà
 * (voir `globals.css`) : le widget Journal du planificateur rend le même
 * markdown avec react-markdown, et les deux surfaces doivent produire la même
 * chose. Un jeu de classes parallèle les ferait diverger sans qu'on le voie.
 */
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

/** Markdown courant de l'éditeur. */
function lireMarkdown(editor: LexicalEditor): string {
  let md = "";
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMERS);
  });
  return md;
}

/** Longueur du texte brut — sert à retrouver la jointure après une fusion. */
function longueurTexte(editor: LexicalEditor): number {
  let n = 0;
  editor.getEditorState().read(() => {
    n = $getRoot().getTextContent().length;
  });
  return n;
}

/**
 * Coupe au curseur et rend les deux moitiés en markdown.
 *
 * `$convertToMarkdownString` sérialise les ENFANTS d'un élément : on ne peut
 * donc pas sérialiser un sous-arbre à la volée. On passe par deux mises à jour
 * JETABLES — couper, supprimer une moitié, lire — en restaurant l'état entre
 * les deux. C'est Lexical qui fait le travail délicat de la coupe, formats
 * compris : couper au milieu d'un mot en gras garde le gras des deux côtés.
 */
function couper(editor: LexicalEditor): { avant: string; apres: string } {
  const depart = editor.getEditorState();

  const moitie = (garder: "avant" | "apres"): string => {
    editor.setEditorState(depart.clone());
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

  const avant = moitie("avant");
  const apres = moitie("apres");
  editor.setEditorState(depart.clone());
  return { avant, apres };
}

// ---------------------------------------------------------------------------

interface ClavierProps {
  onSplit: (avant: string, apres: string) => void;
  onMergeUp: (markdown: string) => void;
  onStep: (dir: -1 | 1) => void;
}

/**
 * Le clavier qui fait d'une pile de blocs une page. Rien ici ne touche au
 * texte : on rend la main à la page, qui seule connaît les voisins.
 */
function ClavierPlugin({ onSplit, onMergeUp, onStep }: ClavierProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /** Le curseur est-il collé au tout début du bloc ? */
    const auDebut = (): boolean => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
      if (sel.anchor.offset !== 0) return false;
      const noeud = sel.anchor.getNode();
      const premier = $getRoot().getFirstDescendant();
      return premier === null || noeud.getKey() === premier.getKey();
    };

    /**
     * Première (ou dernière) ligne VISUELLE : on compare le rectangle du
     * curseur à celui de la zone. Un paragraphe peut occuper trois lignes à
     * l'écran — regarder l'arbre ne suffirait pas.
     */
    const surLaLigne = (bord: "haut" | "bas"): boolean => {
      const dom = editor.getRootElement();
      const s = window.getSelection();
      if (!dom || !s || s.rangeCount === 0) return false;
      const r = s.getRangeAt(0).getBoundingClientRect();
      const z = dom.getBoundingClientRect();
      if (r.height === 0 && r.top === 0) return true; // bloc vide
      const marge = 6;
      return bord === "haut" ? r.top - z.top < marge : z.bottom - r.bottom < marge;
    };

    return [
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e) => {
          if (e?.shiftKey) return false; // Maj+Entrée : retour à la ligne
          e?.preventDefault();
          const { avant, apres } = couper(editor);
          onSplit(avant, apres);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (e) => {
          let colle = false;
          editor.getEditorState().read(() => {
            colle = auDebut();
          });
          if (!colle) return false;
          e?.preventDefault();
          onMergeUp(lireMarkdown(editor));
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (e) => {
          if (!surLaLigne("haut")) return false;
          e?.preventDefault();
          onStep(-1);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (e) => {
          if (!surLaLigne("bas")) return false;
          e?.preventDefault();
          onStep(1);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ].reduce(
      (tout, retirer) => () => {
        tout();
        retirer();
      },
      () => {},
    );
  }, [editor, onSplit, onMergeUp, onStep]);

  return null;
}

// ---------------------------------------------------------------------------

interface SauvegardeProps {
  /** Markdown enregistré à l'ouverture du bloc. */
  origine: string;
  onChange: (markdown: string) => void;
  /** Le bloc perd le focus : la page décide quoi faire d'un bloc vide. */
  onBlur: (markdown: string) => void;
}

/**
 * Enregistrement continu.
 *
 * La référence n'est PAS le markdown stocké mais sa version relue-réécrite :
 * l'analyse peut normaliser (`*x*` devient `_x_`), et comparer au stocké
 * ferait passer cette normalisation pour une modification — chaque bloc serait
 * réécrit à son simple affichage.
 */
function SauvegardePlugin({ origine, onChange, onBlur }: SauvegardeProps) {
  const [editor] = useLexicalComposerContext();
  const referenceRef = useRef<string | null>(null);
  const dernierRef = useRef<string | null>(null);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (referenceRef.current === null) {
      referenceRef.current = lireMarkdown(editor);
      dernierRef.current = referenceRef.current;
    }
  }, [editor]);

  useEffect(() => {
    const pousser = () => {
      const md = lireMarkdown(editor);
      if (md === dernierRef.current) return;
      dernierRef.current = md;
      onChange(md);
    };

    const stopUpdate = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      minuteurRef.current = setTimeout(pousser, 700);
    });

    const dom = editor.getRootElement();
    const surBlur = () => {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      pousser();
      onBlur(lireMarkdown(editor));
    };
    dom?.addEventListener("blur", surBlur);

    return () => {
      stopUpdate();
      dom?.removeEventListener("blur", surBlur);
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
    };
  }, [editor, onChange, onBlur]);

  // `origine` change quand la page réécrit ce bloc (fusion) : on repart de là.
  useEffect(() => {
    referenceRef.current = null;
    dernierRef.current = null;
  }, [origine]);

  return null;
}

// ---------------------------------------------------------------------------

interface FocusProps {
  demande: { caret: Caret; contenu?: string } | null;
  onFocused: () => void;
}

/** La page rend la main à ce bloc : on remplace son texte au besoin, puis on
 *  pose le curseur. */
function FocusPlugin({ demande, onFocused }: FocusProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!demande) return;
    const { caret, contenu } = demande;
    // La jointure d'une fusion est la fin du texte d'AVANT le remplacement :
    // seul l'éditeur la connaît, la page ne voit que du markdown.
    const jointure = longueurTexte(editor);

    editor.update(
      () => {
        if (contenu !== undefined) {
          $getRoot().clear();
          $convertFromMarkdownString(contenu, TRANSFORMERS);
        }
        const racine = $getRoot();
        if (caret === "start") {
          racine.selectStart();
        } else if (caret === "end") {
          racine.selectEnd();
        } else {
          // On avance de `jointure` caractères dans les nœuds de texte.
          let reste = jointure;
          let pose = false;
          for (const n of racine.getAllTextNodes()) {
            const taille = n.getTextContentSize();
            if (reste <= taille) {
              n.select(reste, reste);
              pose = true;
              break;
            }
            reste -= taille;
          }
          if (!pose) racine.selectEnd();
        }
      },
      { discrete: true },
    );
    editor.focus();
    onFocused();
  }, [demande, editor, onFocused]);

  return null;
}

// ---------------------------------------------------------------------------

interface JournalEditorProps {
  markdown: string;
  placeholder?: string;
  focus: { caret: Caret; contenu?: string } | null;
  onFocused: () => void;
  onChange: (markdown: string) => void;
  onBlur: (markdown: string) => void;
  onSplit: (avant: string, apres: string) => void;
  onMergeUp: (markdown: string) => void;
  onStep: (dir: -1 | 1) => void;
  className?: string;
}

/**
 * Un bloc du journal, en édition permanente.
 *
 * Pas de bascule entre « rendu » et « brut » : le texte est TOUJOURS mis en
 * forme, cliquer ne fait que poser le curseur. C'est ce que l'ancienne
 * version ne pouvait pas donner — elle montrait les `**` dès qu'on entrait
 * dans un bloc, et les cachait en sortant.
 */
export function JournalEditor({
  markdown,
  placeholder,
  focus,
  onFocused,
  onChange,
  onBlur,
  onSplit,
  onMergeUp,
  onStep,
  className,
}: JournalEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "journal-bloc",
        nodes: NOEUDS,
        theme: THEME,
        editorState: () => $convertFromMarkdownString(markdown, TRANSFORMERS),
        onError: (error) => {
          throw error;
        },
      }}
    >
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={cn("journal-prose outline-none", className)}
            aria-label="Bloc du journal"
          />
        }
        placeholder={
          placeholder ? (
            <p className="pointer-events-none absolute top-0 select-none text-muted-foreground/45">
              {placeholder}
            </p>
          ) : null
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      {/* L'historique est PAR BLOC : annuler dans un bloc n'annule pas le
          voisin. C'est le prix d'un éditeur par bloc, et il est acceptable —
          on n'écrit que dans un bloc à la fois. */}
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      {/* Ce qui rend l'écriture WYSIWYG : `**gras**` devient gras à la frappe,
          et les astérisques disparaissent pour de bon. */}
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <ClavierPlugin onSplit={onSplit} onMergeUp={onMergeUp} onStep={onStep} />
      <SauvegardePlugin origine={markdown} onChange={onChange} onBlur={onBlur} />
      <FocusPlugin demande={focus} onFocused={onFocused} />
    </LexicalComposer>
  );
}
