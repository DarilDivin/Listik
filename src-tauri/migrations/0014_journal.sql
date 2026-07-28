-- Journal quotidien (Phase P, remplace le module Notes) : un "bloc horodaté"
-- = une ligne. Une "page-jour" = toutes les lignes dont `target_day` correspond
-- à cette date, triées par `written_at`. `target_day` peut être dans le futur
-- (note écrite en avance) : `written_at` reste alors la date d'écriture réelle,
-- distincte de `target_day`.
CREATE TABLE IF NOT EXISTS journal_entries (
    id         TEXT PRIMARY KEY,
    target_day TEXT NOT NULL,
    written_at TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_target_day ON journal_entries (target_day);
CREATE INDEX IF NOT EXISTS idx_journal_entries_written_at ON journal_entries (written_at);

-- Liaison M-N bloc ↔ tags, même pattern que `task_tags`.
CREATE TABLE IF NOT EXISTS journal_entry_tags (
    entry_id TEXT NOT NULL,
    tag_id   TEXT NOT NULL,
    PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_entry_tags_tag_id ON journal_entry_tags (tag_id);
