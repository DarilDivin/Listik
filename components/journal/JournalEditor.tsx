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
  TRANSFORMERS,
} from "@lexical/markdown";
import {
  $createParagraphNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
} from "lexical";
import {
  lireMarkdown,
  NOEUDS,
} from "@/features/journal/decoupe";
import { cn } from "@/lib/utils";

/** Où poser le curseur quand la page rend la main à ce bloc. */
export type Caret = "start" | "end" | "suite";

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


// ---------------------------------------------------------------------------

interface ClavierProps {
  onStep: (dir: -1 | 1) => void;
}

/**
 * Ce qui reste du clavier une fois qu'un bloc est une REPRISE et non un
 * paragraphe : les flèches, pour passer d'un moment au suivant.
 *
 * Entrée et Retour arrière ne sont plus ici. Un bloc est un document — Entrée
 * y fait un paragraphe, une liste y reste une liste, c'est le travail de
 * Lexical. Et recoller deux blocs effacerait une frontière de moment, la seule
 * chose que cette page existe pour garder.
 */
function ClavierPlugin({ onStep }: ClavierProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
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
      // Un rectangle nul ne veut PAS dire « bloc vide » : une selection
      // repliee en renvoie parfois un. On ne conclut que si le bloc est
      // reellement vide, sinon les fleches sauteraient de bloc a chaque fois.
      if (r.height === 0 && r.top === 0) return dom.textContent?.length === 0;
      const marge = 6;
      return bord === "haut" ? r.top - z.top < marge : z.bottom - r.bottom < marge;
    };

    return [

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
  }, [editor, onStep]);

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

  // `origine` change quand la page réécrit ce bloc : ce qu'elle dit devient
  // le dernier accord connu. Remettre les repères à `null` faisait pousser
  // AVEUGLÉMENT ce que l'éditeur affichait encore — du texte périmé, qui
  // écrasait la réécriture. C'est ainsi qu'une scission se défaisait.
  useEffect(() => {
    referenceRef.current = origine;
    dernierRef.current = origine;
  }, [origine]);

  return null;
}

// ---------------------------------------------------------------------------

/**
 * Le contenu a changé EN DEHORS de cet éditeur : la page l'a réécrit.
 *
 * Lexical ne relit son état initial qu'au MONTAGE ; sans ça, une reprise
 * prolongée depuis la capture rapide (`/note`) resterait affichée telle
 * qu'elle était à l'ouverture de la page.
 *
 * On ne touche jamais un éditeur qui a le focus, ni un qui attend une demande
 * de focus : ce serait remplacer le texte sous le curseur.
 */
function SyncPlugin({
  markdown,
  focusEnAttente,
}: {
  markdown: string;
  focusEnAttente: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (focusEnAttente) return;
    const dom = editor.getRootElement();
    if (dom && document.activeElement === dom) return;
    if (lireMarkdown(editor) === markdown) return;
    editor.update(
      () => {
        $getRoot().clear();
        $convertFromMarkdownString(markdown, TRANSFORMERS);
      },
      { discrete: true },
    );
  }, [markdown, focusEnAttente, editor]);

  return null;
}

// ---------------------------------------------------------------------------

interface FocusProps {
  demande: { caret: Caret } | null;
  onFocused: () => void;
}

/** La page rend la main à ce bloc : on y pose le curseur. */
function FocusPlugin({ demande, onFocused }: FocusProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!demande) return;
    const { caret } = demande;

    editor.update(
      () => {
        const racine = $getRoot();
        if (caret === "start") {
          racine.selectStart();
        } else if (caret === "end") {
          racine.selectEnd();
        } else if (caret === "suite") {
          // « Écrire… » sur une reprise déjà commencée : on veut une LIGNE
          // neuve, pas la suite de la phrase. Sans ça, le nouveau texte se
          // collait au dernier mot du bloc.
          const dernier = racine.getLastChild();
          if (dernier !== null && dernier.getTextContent() !== "") {
            const p = $createParagraphNode();
            racine.append(p);
            p.select();
          } else {
            racine.selectEnd();
          }
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
  focus: { caret: Caret } | null;
  onFocused: () => void;
  onChange: (markdown: string) => void;
  onBlur: (markdown: string) => void;
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
      <ClavierPlugin onStep={onStep} />
      <SauvegardePlugin origine={markdown} onChange={onChange} onBlur={onBlur} />
      <SyncPlugin markdown={markdown} focusEnAttente={focus !== null} />
      <FocusPlugin demande={focus} onFocused={onFocused} />
    </LexicalComposer>
  );
}
