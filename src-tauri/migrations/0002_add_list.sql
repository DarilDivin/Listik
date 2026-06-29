-- Liste / projet (optionnel) auquel une tâche appartient.
ALTER TABLE todos ADD COLUMN list TEXT;

CREATE INDEX IF NOT EXISTS idx_todos_list ON todos (list);
