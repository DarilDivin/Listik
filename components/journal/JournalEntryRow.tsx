"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TagControl } from "@/components/todo/TagControl";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date";
import type { JournalEntry } from "@/features/journal/types";
import type { Tag } from "@/features/tags/types";

interface JournalEntryRowProps {
  entry: JournalEntry;
  allTags: Tag[];
  onChangeContent: (content: string) => void;
  onChangeTags: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<string>;
  onDelete: () => void;
}

/**
 * Un bloc horodaté : rendu markdown statique au repos (léger — pas d'éditeur
 * monté pour les blocs déjà écrits d'une page-jour), bascule en champ modifiable
 * au clic. Pas d'undo à la suppression (voir `useJournalMutations`) : une
 * confirmation suffit, cohérent avec le volume (quelques blocs par jour).
 */
export function JournalEntryRow({
  entry,
  allTags,
  onChangeContent,
  onChangeTags,
  onCreateTag,
  onDelete,
}: JournalEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const savedRef = useRef(entry.content);

  useEffect(() => {
    if (!editing) {
      setDraft(entry.content);
      savedRef.current = entry.content;
    }
  }, [entry.content, editing]);

  const flush = () => {
    setEditing(false);
    if (draft === savedRef.current) return;
    savedRef.current = draft;
    onChangeContent(draft);
  };

  // `written_at` est un timestamp ISO en UTC (`chrono::Utc::now()` côté
  // Rust) : en dériver le JOUR passe obligatoirement par `toLocalISODate`
  // (jamais un `.slice(0, 10)` sur la chaîne brute, qui donnerait le jour
  // UTC — faux près de minuit en fuseau non-nul, même piège documenté dans
  // `lib/date.ts`/`recurrence.ts`).
  const writtenAt = new Date(entry.written_at);
  const writtenTime = format(writtenAt, "HH:mm");
  const writtenDateLocal = toLocalISODate(writtenAt);
  // Badge « écrit le … » : seulement quand le jour d'écriture réel diffère du
  // jour d'appartenance de la page (entrée écrite en avance).
  const writtenElsewhere = writtenDateLocal !== entry.target_day;

  return (
    <div className="group/entry flex flex-col gap-1.5 border-t border-border/50 py-3 first:border-t-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <span className="tabular-nums">{writtenTime}</span>
        {writtenElsewhere && (
          <span>écrit le {format(writtenAt, "d MMM", { locale: fr })}</span>
        )}
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100">
          <TagControl
            value={entry.tags}
            tags={allTags}
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
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Supprimer</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce bloc ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ce texte sera définitivement supprimé. Cette action est
                  irréversible.
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
      </div>

      {editing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={flush}
          spellCheck={false}
          className="min-h-[2.5rem] resize-none rounded-none border-none bg-transparent px-0 py-0 text-[0.95rem] leading-7 text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      ) : (
        // `div[role=button]`, pas un vrai `<button>` : le contenu est du
        // markdown en bloc (paragraphes, listes, liens…), invalide dans le
        // modèle de contenu d'un bouton natif (et un lien y serait un
        // interactif imbriqué dans un interactif).
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditing(true);
            }
          }}
          className={cn(
            "note-markdown -mx-1 cursor-text rounded-lg px-1 py-0.5 outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {entry.content || "_Bloc vide_"}
          </ReactMarkdown>
        </div>
      )}

      {!editing && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
