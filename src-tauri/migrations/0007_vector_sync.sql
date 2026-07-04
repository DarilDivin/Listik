-- Synchronisation vers la base vectorielle du sidecar (indexation asynchrone, D3).
-- DEFAULT 1 : les lignes déjà existantes sont aussi marquées à indexer (sync initiale).
ALTER TABLE todos ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 1;

-- File d'attente des suppressions à répercuter côté sidecar : la ligne d'origine
-- a déjà disparu de todos/notes au moment où la tâche de fond tourne.
CREATE TABLE IF NOT EXISTS pending_deindex (
    id        TEXT PRIMARY KEY,
    type      TEXT NOT NULL,
    queued_at TEXT NOT NULL
);
