"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Eye, Pencil, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/notes/types";

interface NoteEditorProps {
  note: Note;
  /** Sauvegarde (autosave debouncé + sur blur). */
  onChange: (patch: { title: string; content: string }) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

const MODES = [
  { preview: false, label: "Écrire", Icon: Pencil },
  { preview: true, label: "Aperçu", Icon: Eye },
] as const;

/**
 * Éditeur d'une note : titre + corps Markdown, avec bascule Écrire/Aperçu en
 * segmented control et autosave. Monté avec `key={note.id}` côté parent →
 * l'état local s'initialise à la note.
 */
export function NoteEditor({ note, onChange, onTogglePin, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [preview, setPreview] = useState(false);

  const saved = useRef({ title: note.title, content: note.content });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Enregistre immédiatement si modifié (appelé au blur des champs).
  const flush = () => {
    if (title === saved.current.title && content === saved.current.content) return;
    saved.current = { title, content };
    onChangeRef.current({ title, content });
  };

  // Autosave debouncé pendant la frappe.
  useEffect(() => {
    if (title === saved.current.title && content === saved.current.content) return;
    const t = setTimeout(() => {
      saved.current = { title, content };
      onChangeRef.current({ title, content });
    }, 500);
    return () => clearTimeout(t);
  }, [title, content]);

  const updatedAt = new Date(note.updated_at);
  const updatedLabel = Number.isNaN(updatedAt.getTime())
    ? null
    : formatDistanceToNow(updatedAt, { addSuffix: true, locale: fr });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 pb-2 pt-5">
        <span className="truncate text-xs text-muted-foreground/70">
          {updatedLabel ? `Modifiée ${updatedLabel}` : ""}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Bascule Écrire / Aperçu — pouce glissant (layoutId). */}
          <div className="inline-flex items-center rounded-lg bg-foreground/[0.045] p-[3px] dark:bg-foreground/[0.07]">
            {MODES.map(({ preview: isPreview, label, Icon }) => {
              const active = preview === isPreview;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPreview(isPreview)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs transition-colors duration-200",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground/80",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="note-mode-thumb"
                      aria-hidden
                      className="absolute inset-0 rounded-[6px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.04] dark:bg-accent dark:ring-white/[0.07]"
                      transition={spring.snappy}
                    />
                  )}
                  <Icon size={12} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onTogglePin}
                aria-label={note.pinned ? "Désépingler" : "Épingler"}
                className={cn(
                  note.pinned
                    ? "text-brand hover:text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Pin className={note.pinned ? "fill-current" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {note.pinned ? "Désépingler" : "Épingler"}
            </TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer la note"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Supprimer</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer la note ?</AlertDialogTitle>
                <AlertDialogDescription>
                  « {note.title.trim() || "Sans titre"} » sera définitivement
                  supprimée. Cette action est irréversible.
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
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-8 py-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flush}
          placeholder="Titre"
          className="w-full bg-transparent text-3xl font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/40"
        />

        {preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="note-markdown mt-5 flex-1"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "_Note vide_"}
            </ReactMarkdown>
          </motion.div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={flush}
            placeholder="Écris en Markdown…"
            spellCheck={false}
            className="mt-5 flex-1 resize-none rounded-none border-none bg-transparent px-0 py-0 text-[0.95rem] leading-7 text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        )}
      </div>
    </div>
  );
}
