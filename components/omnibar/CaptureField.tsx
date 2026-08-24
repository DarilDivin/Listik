"use client";

import { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { tokenizeCapture } from "@/features/omnibar/tokenize";
import { $createTokenNode, $isTokenNode, TokenNode } from "./TokenNode";
import { cn } from "@/lib/utils";

/** Position du curseur, comptée en caractères depuis le début de la ligne —
 *  la seule qui survive à une reconstruction des nœuds. */
function $readCaret(): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const node = selection.anchor.getNode();
  let offset =
    selection.anchor.type === "text"
      ? selection.anchor.offset
      : node.getTextContentSize();
  let prev = node.getPreviousSibling();
  while (prev) {
    offset += prev.getTextContentSize();
    prev = prev.getPreviousSibling();
  }
  return offset;
}

function $restoreCaret(paragraph: ElementNode, offset: number): void {
  let remaining = offset;
  for (const child of paragraph.getChildren()) {
    const size = child.getTextContentSize();
    if (remaining <= size && typeof (child as never as { select?: unknown }).select === "function") {
      (child as never as { select: (a: number, b: number) => void }).select(
        remaining,
        remaining,
      );
      return;
    }
    remaining -= size;
  }
  paragraph.selectEnd();
}

/** Rebâtit la ligne à partir des segments. Le curseur est repris à l'identique. */
function $writeSegments(text: string, keepCaret: boolean): void {
  const root = $getRoot();
  const caret = keepCaret ? $readCaret() : null;

  const paragraph = $createParagraphNode();
  for (const segment of tokenizeCapture(text)) {
    paragraph.append(
      segment.kind
        ? $createTokenNode(segment.text, segment.kind)
        : $createTextNode(segment.text),
    );
  }
  root.clear();
  root.append(paragraph);

  if (caret === null) paragraph.selectEnd();
  else $restoreCaret(paragraph, caret);
}

/** La ligne porte-t-elle déjà exactement ces segments ? Sans cette comparaison,
 *  chaque reconstruction en déclencherait une autre, indéfiniment. */
function $matchesSegments(text: string): boolean {
  const expected = tokenizeCapture(text);
  const first = $getRoot().getFirstChild();
  const children = $isElementNode(first) ? first.getChildren() : [];
  if (children.length !== expected.length) return false;
  return expected.every((segment, i) => {
    const child = children[i];
    const kind = $isTokenNode(child) ? child.getKind() : null;
    return kind === segment.kind && child.getTextContent() === segment.text;
  });
}

/**
 * Tient la ligne tokenisée, et remonte le texte au parent qui reste maître de
 * la valeur (l'Omnibar peut la réécrire : commande slash, choix de date…).
 */
function SyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  // Dernier texte que NOUS avons annoncé : sert à distinguer « le parent a
  // changé la valeur » de « le parent nous renvoie ce qu'on vient d'émettre ».
  const emitted = useRef(value);

  // Valeur venue du parent → éditeur.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    editor.update(() => {
      if ($getRoot().getTextContent() === value) return;
      $writeSegments(value, false);
    });
  }, [value, editor]);

  // Éditeur → parent, puis re-tokenisation de la ligne.
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const text = editorState.read(() => $getRoot().getTextContent());
        if (text !== emitted.current) {
          emitted.current = text;
          onChange(text);
        }
        // Jamais au milieu d'une saisie IME : reconstruire les nœuds
        // interromprait la composition en cours.
        if (editor.isComposing()) return;
        const stale = editorState.read(() => !$matchesSegments(text));
        if (stale) editor.update(() => $writeSegments(text, true));
      }),
    [editor, onChange],
  );

  return null;
}

/** Entrée valide (Maj+Entrée reste un saut de ligne, géré par Lexical). */
function KeysPlugin({
  onEnter,
  onKeyDown,
}: {
  onEnter: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const handler = (event: KeyboardEvent) => {
      onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLElement>);
      if (event.defaultPrevented) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onEnter();
      }
    };
    root.addEventListener("keydown", handler);
    return () => root.removeEventListener("keydown", handler);
  }, [editor, onEnter, onKeyDown]);
  return null;
}

/** Une ligne fait `LINE_HEIGHT` ; au-dela, la saisie s'enroule. */
const LINE_HEIGHT = 24;

function MultilinePlugin({ onChange }: { onChange?: (m: boolean) => void }) {
  const [editor] = useLexicalComposerContext();
  const wasMultiline = useRef(false);
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root || !onChange) return;
    const measure = () => {
      const multiline = root.offsetHeight > LINE_HEIGHT + 8;
      if (multiline !== wasMultiline.current) {
        wasMultiline.current = multiline;
        onChange(multiline);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [editor, onChange]);
  return null;
}

function AutoFocusPlugin({ enabled }: { enabled?: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (enabled) editor.focus();
  }, [enabled, editor]);
  return null;
}

interface CaptureFieldProps {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onEnter: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Invite estompée : la rangée est au repos. */
  dimmed?: boolean;
  /** Notifie quand la saisie passe sur plusieurs lignes (l'Omnibar déplace
   *  alors ses contrôles sous le texte). */
  onMultilineChange?: (multiline: boolean) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Champ de capture bâti sur Lexical. Il remplace le couple miroir +
 * `<textarea>` transparent : les fragments reconnus sont ici de vrais nœuds
 * (`TokenNode`) dans le flux du texte, plus des `<span>` peints sur un calque
 * recouvert.
 *
 * Ce que ça débloque : le survol et le clic atteignent enfin le fragment, et
 * l'alignement cesse d'être un problème — il n'y a plus deux couches à tenir
 * aux mêmes métriques de boîte.
 *
 * La valeur reste détenue par l'Omnibar (champ contrôlé) : `useTaskMode`, le
 * menu slash et l'autocomplétion continuent de travailler sur une chaîne, sans
 * rien connaître de l'éditeur.
 */
export function CaptureField({
  value,
  onChange,
  onFocus,
  onEnter,
  placeholder,
  autoFocus,
  dimmed,
  onKeyDown,
  onMultilineChange,
}: CaptureFieldProps) {
  return (
    <div className="relative w-full">
      <LexicalComposer
        initialConfig={{
          namespace: "capture",
          nodes: [TokenNode],
          // Une ligne de capture ne porte aucun style de bloc : le thème est
          // volontairement vide, tout vient des nœuds.
          theme: {},
          onError: (error: Error) => {
            console.error("Éditeur de capture :", error);
          },
          editorState: (editor: LexicalEditor) =>
            editor.update(() => $writeSegments(value, false)),
        }}
      >
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              onFocus={onFocus}
              spellCheck={false}
              aria-label={placeholder}
              className="min-h-6 w-full resize-none whitespace-pre-wrap break-words pr-2 font-sans text-base font-normal leading-normal outline-none"
            />
          }
          placeholder={
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-center pr-2 font-sans text-base font-normal leading-normal transition-colors",
                dimmed ? "text-muted-foreground/50" : "text-muted-foreground",
              )}
            >
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SyncPlugin value={value} onChange={onChange} />
        <MultilinePlugin onChange={onMultilineChange} />
        <KeysPlugin onEnter={onEnter} onKeyDown={onKeyDown} />
        <AutoFocusPlugin enabled={autoFocus} />
      </LexicalComposer>
    </div>
  );
}
