-- Sous-tâches : checklist à un seul niveau, attachée à une tâche.
CREATE TABLE IF NOT EXISTS sub_tasks (
    id         TEXT PRIMARY KEY,
    todo_id    TEXT NOT NULL,
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_tasks_todo_id ON sub_tasks (todo_id);
