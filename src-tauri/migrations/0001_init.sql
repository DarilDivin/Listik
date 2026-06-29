CREATE TABLE IF NOT EXISTS todos (
    id            TEXT PRIMARY KEY,
    text          TEXT NOT NULL,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    priority      TEXT NOT NULL DEFAULT 'normal',
    scheduled_for TEXT,
    due_date      TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_scheduled_for ON todos (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status);
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at);
