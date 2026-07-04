"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil, Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/notes/types";

interface NoteEditorProps {
  note: Note;
  /** Sauvegarde (autosave debouncé + sur blur). */
  onChange: (patch: { title: string; content: string }) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

/**
 * Éditeur d'une note : titre + corps Markdown, avec aperçu et autosave.
 * Monté avec `key={note.id}` côté parent → l'état local s'initialise à la note.
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

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-end gap-1 border-b border-border/40 px-4 py-2.5">
        <button
          type="button"
          onClick={onTogglePin}
          title={note.pinned ? "Désépingler" : "Épingler"}
          className={cn(
            "grid size-8 place-items-center rounded-lg transition-colors hover:bg-accent",
            note.pinned ? "text-brand" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Pin size={16} className={note.pinned ? "fill-current" : ""} />
        </button>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          title={preview ? "Éditer" : "Aperçu"}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {preview ? <Pencil size={16} /> : <Eye size={16} />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={16} />
        </button>
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
          <div className="note-markdown mt-5 flex-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "_Note vide_"}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={flush}
            placeholder="Écris en Markdown…"
            spellCheck={false}
            className="mt-5 w-full flex-1 resize-none bg-transparent text-[0.95rem] leading-7 text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        )}
      </div>
    </div>
  );
}
