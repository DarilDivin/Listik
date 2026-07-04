"use client";

import { useEffect, useMemo, useState } from "react";
import { Pin, Plus, Search } from "lucide-react";
import { useNotes } from "@/hooks/useNotes";
import { NoteEditor } from "@/components/notes/NoteEditor";
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
  const { notes, loading, createNote, updateNote, deleteNote } = useNotes();
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

  // Sélection par défaut : la première note visible.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

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
      <div className="flex w-72 shrink-0 flex-col border-r border-border/40">
        <div className="flex items-center justify-between px-4 pb-2 pt-5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Notes</h1>
          <button
            type="button"
            onClick={handleNew}
            title="Nouvelle note"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {loading
                ? "Chargement…"
                : query
                  ? "Aucune note trouvée"
                  : "Aucune note. Crée-en une avec +."}
            </li>
          ) : (
            filtered.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                    note.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
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
              </li>
            ))
          )}
        </ul>
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
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
            Sélectionne une note à gauche, ou crée-en une avec +.
          </div>
        )}
      </div>
    </div>
  );
}
