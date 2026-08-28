"use client";

import dynamic from "next/dynamic";
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
import type { Caret } from "@/components/journal/JournalEditor";
import type { JournalEntry } from "@/features/journal/types";
import type { Tag } from "@/features/tags/types";

export type { Caret };

/**
 * L'éditeur n'est chargé que par la page Journal — même parti que l'Omnibar
 * avec `CaptureField` : rich-text, markdown, listes et liens n'ont rien à
 * faire dans le lot commun.
 */
const JournalEditor = dynamic(
  () => import("@/components/journal/JournalEditor").then((m) => m.JournalEditor),
  {
    ssr: false,
    loading: () => <div className="journal-prose opacity-0">&nbsp;</div>,
  },
);

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
  /** Demande de focus venue de la page (fusion, scission, flèches). */
  focus: { caret: Caret; contenu?: string } | null;
  onFocused: () => void;
  onChange: (content: string) => void;
  onBlur: (content: string) => void;
  onSplit: (avant: string, apres: string) => void;
  onMergeUp: (contenu: string) => void;
  onStep: (dir: -1 | 1) => void;
  onChangeTags: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<string>;
  onDelete: () => void;
}

/**
 * Un bloc de la page-jour. Il n'a ni cadre, ni fond, ni séparateur : la page
 * doit se lire comme un texte suivi, pas comme une liste de cartes. Ce qui
 * distingue un bloc du suivant, c'est son heure dans la gouttière.
 *
 * Le texte est en édition PERMANENTE (voir `JournalEditor`) : plus de bascule
 * entre rendu et brut, donc plus d'astérisques qui apparaissent au clic.
 */
export function JournalBlock({
  entry,
  targetDay,
  sessionStart,
  allTags,
  focus,
  onFocused,
  onChange,
  onBlur,
  onSplit,
  onMergeUp,
  onStep,
  onChangeTags,
  onCreateTag,
  onDelete,
}: JournalBlockProps) {
  // `written_at` est un instant UTC : en tirer le JOUR passe par
  // `toLocalISODate`, jamais par un `slice(0, 10)` sur la chaîne brute (faux
  // près de minuit hors UTC — même piège que dans `lib/date.ts`).
  const writtenAt = new Date(entry.written_at);
  const heure = format(writtenAt, "HH:mm");
  const ailleurs = toLocalISODate(writtenAt) !== targetDay;
  // Une heure reste posée quand elle porte une information qu'on perdrait :
  // le début d'une reprise, ou un bloc écrit un autre jour.
  const heureFixe = sessionStart || ailleurs;

  return (
    <div className="group/bloc relative">
      {/* L'heure vit dans la gouttière, jamais dans le texte. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -left-[104px] top-[0.45em] hidden w-[88px] select-none text-right font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity duration-300 md:block",
          heureFixe ? "opacity-50" : "opacity-0 group-hover/bloc:opacity-80",
        )}
      >
        {heure}
      </span>
      {/* Écrit un autre jour : le seul signe visible d'un bloc antidaté. */}
      {ailleurs && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[104px] top-[2em] hidden w-[88px] select-none text-right text-[10px] leading-tight text-muted-foreground opacity-40 md:block"
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

      <div className="relative">
        <JournalEditor
          markdown={entry.content}
          placeholder={entry.content ? undefined : "Écrire…"}
          focus={focus}
          onFocused={onFocused}
          onChange={onChange}
          onBlur={onBlur}
          onSplit={onSplit}
          onMergeUp={onMergeUp}
          onStep={onStep}
        />
      </div>
    </div>
  );
}
