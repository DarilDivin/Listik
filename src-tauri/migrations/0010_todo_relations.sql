-- Nouvelles colonnes sur `todos` pour la structure Things (Phase E). Additives
-- et ignorées par l'UI actuelle. Le rattachement à un projet reste NULL pour
-- toutes les lignes jusqu'à la réconciliation `list → projets` faite en Phase G
-- (en Rust, sur données vivantes — pas de backfill SQL figé ici).
-- SQLite : une seule colonne par ALTER ; NOT NULL exige une valeur par défaut.

ALTER TABLE todos ADD COLUMN project_id TEXT;
ALTER TABLE todos ADD COLUMN heading_id TEXT;
-- « Ce soir » : sous-section de la vue Aujourd'hui.
ALTER TABLE todos ADD COLUMN this_evening INTEGER NOT NULL DEFAULT 0;
-- « Un jour » (Someday) : rangée hors des horizons datés, jusqu'à réactivation.
ALTER TABLE todos ADD COLUMN someday INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_todos_project_id ON todos (project_id);
