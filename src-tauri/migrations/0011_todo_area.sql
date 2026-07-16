-- Une tâche peut être rangée directement dans un Domaine, sans projet
-- intermédiaire (comportement Things de base) : le schéma 0010 ne savait
-- rattacher qu'à un projet. Colonne additive, NULL pour toutes les lignes.
ALTER TABLE todos ADD COLUMN area_id TEXT;

CREATE INDEX IF NOT EXISTS idx_todos_area_id ON todos (area_id);
