-- Rappel par tâche : date-heure LOCALE « YYYY-MM-DDTHH:MM » (NULL = aucun rappel).
ALTER TABLE todos ADD COLUMN remind_at TEXT;
-- Drapeau interne : passe à 1 une fois la notification envoyée (évite les doublons).
ALTER TABLE todos ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0;
