-- Récurrence d'une tâche : none / daily / weekdays / weekly / monthly.
ALTER TABLE todos ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none';
