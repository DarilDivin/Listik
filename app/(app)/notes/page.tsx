"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { NotebookPen, Pin, Plus, Search } from "lucide-react";
import { useNotes } from "@/hooks/useNotes";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/notes/types";

/** Titre affiché : le titre, sinon la 1re ligne du contenu, sinon « Nouvelle note ». */
function displayTitle(note: Note): string {
  const t = note.title.trim();
  if (t) return t;
  const firstLine = note.content.split("\n").find((l) => l.trim());
  return firstLine?.trim() || "Nouvelle note";
}

/** Aperçu une ligne du corps (marqueurs Markdown grossièrement retirés). */
function preview(note: Note): string {
  const body = note.title.trim()
    ? note.content
    : note.content.split("\n").slice(1).join(" ");
  return body.replace(/[#>*_`~]/g, "").replace(/\s+/g, " ").trim();
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Chargement…
        </div>
      }
    >
      <NotesPageContent />
    </Suspense>
  );
}

function NotesPageContent() {
  const { notes, loading, createNote, updateNote, deleteNote } = useNotes();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // Sélection demandée depuis l'extérieur (recherche Ctrl+K) : prioritaire,
  // réappliquée à chaque changement (pas seulement au premier rendu).
  useEffect(() => {
    if (requestedId && notes.some((n) => n.id === requestedId)) {
      setSelectedId(requestedId);
    }
  }, [requestedId, notes]);

  // Sélection par défaut : la première note visible — seulement si rien n'est
  // demandé explicitement et rien n'est déjà sélectionné.
  useEffect(() => {
    if (!requestedId && !selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [requestedId, filtered, selectedId]);

  const handleNew = async () => {
    const note = await createNote();
    setSelectedId(note.id);
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  return (
    <div className="flex h-full">
      {/* Colonne liste */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border/50">
        <div className="flex items-center justify-between px-4 pb-2 pt-6">
          <h1 className="text-title-2 text-foreground">Notes</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleNew}
                aria-label="Nouvelle note"
                className="text-muted-foreground hover:text-foreground"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Nouvelle note</TooltipContent>
          </Tooltip>
        </div>

        <div className="relative px-3 pb-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-6 top-1/2 -translate-y-[calc(50%+4px)] text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 rounded-lg border-none bg-muted pl-8 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-px px-2 pb-3">
            {loading ? (
              [0.9, 0.65, 0.4].map((opacity) => (
                <li key={opacity} className="px-3 py-2.5" style={{ opacity }}>
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-1.5 h-3 w-full" />
                </li>
              ))
            ) : filtered.length === 0 ? (
              <li className="px-3 pt-6">
                <Empty className="border-none p-4">
                  <EmptyHeader>
                    <EmptyMedia
                      variant="icon"
                      className="rounded-xl bg-brand-soft text-brand"
                    >
                      <NotebookPen />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">
                      {query ? "Aucune note trouvée" : "Aucune note"}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs">
                      {query
                        ? "Essayez d'autres mots."
                        : "Créez votre première note avec +."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </li>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((note) => {
                  const isSelected = note.id === selectedId;
                  return (
                    <motion.li
                      key={note.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                      transition={spring.smooth}
                      className="relative"
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="note-selected-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-xl bg-brand-soft"
                          transition={spring.snappy}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedId(note.id)}
                        className={cn(
                          "relative z-10 flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                          !isSelected && "hover:bg-accent/60",
                        )}
                      >
                        <span className="flex w-full items-center gap-1.5">
                          {note.pinned && (
                            <Pin size={11} className="shrink-0 fill-current text-brand" />
                          )}
                          <span className="truncate text-sm font-medium text-foreground">
                            {displayTitle(note)}
                          </span>
                        </span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {preview(note) || "Note vide"}
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            )}
          </ul>
        </ScrollArea>
      </div>

      {/* Éditeur */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onChange={(patch) => updateNote(selected.id, patch)}
            onTogglePin={() => updateNote(selected.id, { pinned: !selected.pinned })}
            onDelete={() => handleDelete(selected.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="rounded-2xl bg-brand-soft text-brand"
                >
                  <NotebookPen />
                </EmptyMedia>
                <EmptyTitle>Aucune note ouverte</EmptyTitle>
                <EmptyDescription>
                  Sélectionnez une note à gauche, ou créez-en une avec +.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
