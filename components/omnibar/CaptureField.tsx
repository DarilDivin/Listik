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
import { tokenizeCapture, type TokenKind } from "@/features/omnibar/tokenize";
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

/**
 * Aligne la ligne sur les segments attendus, en ne remplaçant QUE les nœuds
 * qui ont changé. Tout recréer serait plus court à écrire, mais chaque frappe
 * détruirait et recréerait les jetons intacts : leurs éléments DOM étant
 * neufs, leurs animations d'apparition se rejoueraient sans fin (le halo de
 * la note clignoterait à chaque lettre tapée ailleurs).
 */
function $writeSegments(text: string, keepCaret: boolean): void {
  const root = $getRoot();
  const caret = keepCaret ? $readCaret() : null;

  const existing = root.getFirstChild();
  let paragraph: ElementNode;
  if ($isElementNode(existing)) {
    paragraph = existing;
  } else {
    paragraph = $createParagraphNode();
    root.clear();
    root.append(paragraph);
  }

  const expected = tokenizeCapture(text);
  const children = paragraph.getChildren();

  expected.forEach((segment, i) => {
    const child = children[i];
    const kind = $isTokenNode(child) ? child.getKind() : null;
    if (child && kind === segment.kind && child.getTextContent() === segment.text) {
      return; // inchangé : on le laisse vivre, animation comprise
    }
    const node = segment.kind
      ? $createTokenNode(segment.text, segment.kind)
      : $createTextNode(segment.text);
    if (child) child.replace(node);
    else paragraph.append(node);
  });

  // Segments disparus (le texte a raccourci).
  for (let i = expected.length; i < children.length; i++) children[i].remove();

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

/**
 * Entrée valide la saisie ; Maj+Entrée reste un saut de ligne, laissé à
 * Lexical.
 *
 * Écouté en phase de CAPTURE, et non en bulle : Lexical attache son propre
 * gestionnaire au même élément et le fait AVANT nous. Il insérait donc son
 * saut de ligne puis marquait l'événement comme traité — sur quoi nous
 * renoncions, et la tâche n'était jamais soumise. On le prend maintenant en
 * amont, et on lui coupe la propagation pour qu'il n'y touche plus.
 */
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
      // D'abord l'hôte : le menu de commandes et l'autocomplétion ont leur mot
      // à dire sur Entrée (choisir une entrée plutôt que soumettre).
      onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLElement>);
      if (event.key !== "Enter" || event.shiftKey) return;
      // Qu'on soumette ou qu'un menu ait tranché, cet Entrée ne doit pas
      // parvenir à Lexical : il y insérerait un saut de ligne.
      event.stopPropagation();
      if (event.defaultPrevented) return; // un menu l'a consommé
      event.preventDefault();
      onEnter();
    };
    root.addEventListener("keydown", handler, true);
    return () => root.removeEventListener("keydown", handler, true);
  }, [editor, onEnter, onKeyDown]);
  return null;
}

/** Un jeton que l'utilisateur vient de désigner à la souris. */
export interface TokenClick {
  kind: TokenKind;
  text: string;
  /** Position à l'écran, pour y ancrer le sélecteur. */
  rect: DOMRect;
}

/** Natures dont le clic OUVRE un sélecteur. Les autres gardent le
 *  comportement d'un texte ordinaire : le clic y pose le curseur. */
const CLICKABLE: TokenKind[] = ["date", "project", "priority"];

function TokenClickPlugin({
  onTokenClick,
}: {
  onTokenClick?: (info: TokenClick) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root || !onTokenClick) return;
    const handler = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-token]",
      ) as HTMLElement | null;
      const kind = el?.dataset.token as TokenKind | undefined;
      if (!el || !kind || !CLICKABLE.includes(kind)) return;
      // Sur `mousedown` et non `click` : c'est lui qui poserait le curseur
      // dans le jeton. On le retient pour ouvrir le sélecteur à la place.
      event.preventDefault();
      onTokenClick({
        kind,
        text: el.textContent ?? "",
        rect: el.getBoundingClientRect(),
      });
    };
    root.addEventListener("mousedown", handler);
    return () => root.removeEventListener("mousedown", handler);
  }, [editor, onTokenClick]);
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
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** Clic sur un fragment reconnu : l'hôte ouvre le sélecteur correspondant. */
  onTokenClick?: (info: TokenClick) => void;
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
  onTokenClick,
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
        <TokenClickPlugin onTokenClick={onTokenClick} />
        <KeysPlugin onEnter={onEnter} onKeyDown={onKeyDown} />
        <AutoFocusPlugin enabled={autoFocus} />
      </LexicalComposer>
    </div>
  );
}
