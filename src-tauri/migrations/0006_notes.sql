-- Notes autonomes (distinctes du champ `note` attaché à une tâche).
-- Le contenu est du Markdown. `pinned` (0/1) remonte les notes épinglées.
CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (pinned);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at);
