-- Récurrences avancées (Phase J). L'enum `recurrence` existant RESTE la
-- fréquence ; ces colonnes la modulent. Les défauts reproduisent exactement le
-- comportement actuel → aucun backfill, conversion sans perte par définition.
--
-- Modèle : « toutes les N » = recur_interval ; « le 3e mardi du mois » =
-- recur_setpos (1..4, -1 = dernier) + recur_weekday (mon..sun), pour monthly
-- uniquement ; recur_setpos = -1 SANS weekday = « dernier jour du mois »
-- (couvre la fin de mois sans colonne bymonthday). « Après complétion » =
-- recur_mode : la prochaine occurrence se calcule depuis le jour où l'on
-- coche, pas depuis la date planifiée.
--
-- Non-objectif assumé : les ENSEMBLES de jours (« lun/mer/ven ») — recur_weekday
-- est scalaire et réservé au positionnel mensuel.

ALTER TABLE todos ADD COLUMN recur_interval INTEGER NOT NULL DEFAULT 1 CHECK (recur_interval >= 1);
ALTER TABLE todos ADD COLUMN recur_weekday TEXT;
ALTER TABLE todos ADD COLUMN recur_setpos INTEGER;
ALTER TABLE todos ADD COLUMN recur_mode TEXT NOT NULL DEFAULT 'fixed';
