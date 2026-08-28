"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date";
import { TagControl } from "@/components/todo/TagControl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { JournalEntry } from "@/features/journal/types";
import type { Tag } from "@/features/tags/types";

/** Où poser le curseur quand la page donne le focus à ce bloc. */
export type Caret = "start" | "end" | number;

interface JournalBlockProps {
  entry: JournalEntry;
  /** Jour de la page — pour savoir si le bloc a été écrit un AUTRE jour. */
  targetDay: string;
  /**
   * Premier bloc d'une reprise (plus d'une heure depuis le précédent). Son
   * heure reste alors affichée : sans ça, on ne verrait jamais le rythme de la
   * journée sans promener la souris sur chaque paragraphe.
   */
  sessionStart: boolean;
  allTags: Tag[];
  /** Demande de focus venue de la page (navigation au clavier, scission). */
  focus: Caret | null;
  onFocused: () => void;
  onChange: (content: string) => void;
  /** Entrée : ce qui suit le curseur part dans un nouveau bloc. */
  onSplit: (before: string, after: string) => void;
  /** Retour arrière en tête : ce bloc rejoint le précédent. */
  onMergeUp: (content: string) => void;
  /** Flèches en bord de bloc : passer au voisin. */
  onStep: (dir: -1 | 1) => void;
  onChangeTags: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<string>;
  onDelete: () => void;
}

/**
 * Un bloc de la page-jour. Il n'a ni cadre, ni fond, ni séparateur : la page
 * doit se lire comme un texte suivi, pas comme une liste de cartes. Ce qui
 * distingue un bloc du suivant, c'est son heure dans la gouttière — et rien
 * d'autre.
 *
 * Markdown rendu au repos, champ brut au focus (même parti que
 * `JournalEntryRow`) : aucun éditeur monté pour les blocs qu'on ne touche pas,
 * et le rendu reste fidèle à ce qui est enregistré.
 */
export function JournalBlock({
  entry,
  targetDay,
  sessionStart,
  allTags,
  focus,
  onFocused,
  onChange,
  onSplit,
  onMergeUp,
  onStep,
  onChangeTags,
  onCreateTag,
  onDelete,
}: JournalBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const savedRef = useRef(entry.content);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Tant qu'on écrit, on ignore ce qui vient du serveur : la revalidation de
  // `journal:changed` remplacerait le texte sous le curseur.
  useEffect(() => {
    if (!editing) {
      setDraft(entry.content);
      savedRef.current = entry.content;
    }
  }, [entry.content, editing]);

  // La page demande le focus (scission, fusion, flèches) : on le prend et on
  // pose le curseur du bon côté.
  useEffect(() => {
    if (!focus) return;
    const el = fieldRef.current;
    setEditing(true);
    const place = () => {
      const node = fieldRef.current;
      if (!node) return;
      node.focus();
      // Un nombre sert a la fusion : le curseur doit atterrir a la
      // JOINTURE des deux textes, pas a la fin du bloc fusionne.
      const at =
        typeof focus === "number"
          ? Math.min(focus, node.value.length)
          : focus === "start"
            ? 0
            : node.value.length;
      node.setSelectionRange(at, at);
      onFocused();
    };
    if (el) place();
    else requestAnimationFrame(place);
  }, [focus, onFocused]);

  const flush = () => {
    if (draft === savedRef.current) return;
    savedRef.current = draft;
    onChange(draft);
  };

  // `written_at` est un instant UTC : en tirer le JOUR passe par
  // `toLocalISODate`, jamais par un `slice(0, 10)` sur la chaîne brute (faux
  // près de minuit hors UTC — même piège que dans `lib/date.ts`).
  const writtenAt = new Date(entry.written_at);
  const heure = format(writtenAt, "HH:mm");
  const ailleurs = toLocalISODate(writtenAt) !== targetDay;
  // Une heure reste posée quand elle porte une information qu'on perdrait :
  // le début d'une reprise, ou un bloc écrit un autre jour.
  const heureFixe = sessionStart || ailleurs;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;

    // Entrée coupe le bloc ; Maj+Entrée reste un simple retour à la ligne.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      flush();
      onSplit(value.slice(0, start), value.slice(end));
      return;
    }
    // Retour arrière collé au début : le bloc rejoint le précédent.
    if (e.key === "Backspace" && start === 0 && end === 0) {
      e.preventDefault();
      onMergeUp(value);
      return;
    }
    // Les flèches traversent les blocs quand on est au bord : c'est ce qui
    // fait de la pile une page.
    if (e.key === "ArrowUp" && value.lastIndexOf("\n", start - 1) === -1) {
      e.preventDefault();
      onStep(-1);
      return;
    }
    if (e.key === "ArrowDown" && value.indexOf("\n", start) === -1) {
      e.preventDefault();
      onStep(1);
    }
  };

  return (
    <div className="group/bloc relative">
      {/* L'heure vit dans la gouttière, jamais dans le texte. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -left-[104px] top-[0.3em] hidden w-[88px] select-none text-right font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-300 md:block",
          heureFixe ? "opacity-50" : "opacity-0 group-hover/bloc:opacity-80",
        )}
      >
        {heure}
      </span>
      {/* Écrit un autre jour : le seul signe visible d'un bloc antidaté. */}
      {ailleurs && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[104px] top-[1.9em] hidden w-[88px] select-none text-right text-[10px] leading-tight text-muted-foreground opacity-40 md:block"
        >
          écrit le {format(writtenAt, "d MMM", { locale: fr })}
        </span>
      )}

      {/* Tags et suppression : révélés au survol, posés hors du flux pour ne
          jamais décaler le texte. */}
      <span className="absolute -right-2 top-0 flex translate-x-full items-center gap-1 opacity-0 transition-opacity group-hover/bloc:opacity-100 group-focus-within/bloc:opacity-100 max-lg:hidden">
        <TagControl
          value={entry.tags}
          tags={allTags}
          compact
          onChange={onChangeTags}
          onCreate={onCreateTag}
        />
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  aria-label="Supprimer le bloc"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 size={13} />
                </button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Supprimer ce bloc</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce bloc ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le texte de ce moment sera perdu. Les autres blocs du jour ne
                bougent pas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </span>

      {editing ? (
        <textarea
          ref={fieldRef}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setEditing(false);
            // Un bloc vide qu'on quitte n'a rien a dire : il part. Sinon la
            // page accumulerait les lignes creees par une Entree de trop.
            if (!draft.trim()) {
              onDelete();
              return;
            }
            flush();
          }}
          spellCheck={false}
          className="field-sizing-content w-full resize-none bg-transparent p-0 text-[1.0625rem] leading-[1.78] text-foreground outline-none"
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onFocus={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditing(true);
            }
          }}
          className="note-markdown cursor-text text-[1.0625rem] leading-[1.78] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {entry.content || "_Bloc vide_"}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
