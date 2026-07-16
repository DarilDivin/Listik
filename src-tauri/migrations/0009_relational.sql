-- Fondation relationnelle « ergonomie Things » (Phase E) : Domaines → Projets →
-- Tâches, Tags (M-N), et ordre manuel par contexte. Additif et inerte : aucune
-- UI ne lit encore ces tables (l'UI actuelle passe toujours par `todos.list`).
-- NB : ne JAMAIS éditer ce fichier après diffusion (verrou de checksum sqlx) —
-- toute correction va dans une migration ultérieure.

-- Domaines (Areas) : grands piliers de vie, sans date de fin.
CREATE TABLE IF NOT EXISTS areas (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Projets : conteneurs concrets, éventuellement rattachés à un domaine, avec
-- une note et une deadline propres (distincte du `due_date` d'une tâche).
CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    note       TEXT,
    area_id    TEXT,
    status     TEXT NOT NULL DEFAULT 'active',
    deadline   TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_area_id ON projects (area_id);

-- En-têtes internes d'un projet (colonnes/étapes) : table créée dès maintenant,
-- mais SANS modèle/commande/UI (périmètre « lean », activé plus tard).
CREATE TABLE IF NOT EXISTS headings (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_headings_project_id ON headings (project_id);

-- Tags transverses. `parent_id` présent pour l'imbrication future (sans UI).
-- Nom unique insensible à la casse : « Urgent » et « urgent » = un seul tag.
CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    parent_id  TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (name COLLATE NOCASE)
);

-- Liaison M-N tâche ↔ tags.
CREATE TABLE IF NOT EXISTS task_tags (
    todo_id TEXT NOT NULL,
    tag_id  TEXT NOT NULL,
    PRIMARY KEY (todo_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags (tag_id);

-- Ordre manuel par contexte : l'ordre dans un projet ≠ l'ordre dans Aujourd'hui.
-- `context` ∈ { 'today', 'anytime', 'someday', 'inbox', 'project:<id>' }.
-- Table créée en E ; les helpers de lecture/écriture arrivent en K1.
CREATE TABLE IF NOT EXISTS orderings (
    context  TEXT NOT NULL,
    todo_id  TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (context, todo_id)
);
