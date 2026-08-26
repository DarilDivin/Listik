-- Ensembles de jours (« chaque lundi et jeudi »), que la migration 0013
-- écartait explicitement — « Non-objectif assumé : les ENSEMBLES de jours ».
-- Ce n'était donc pas un oubli : la levée est délibérée, et se fait SANS
-- toucher à l'existant.
--
-- `recur_weekday` (singulier) reste SCALAIRE et réservé au positionnel mensuel
-- (« le 3e mardi »). On ne détourne pas sa sémantique pour y loger une liste :
-- deux besoins distincts, deux colonnes.
--
-- Format : jours en minuscules, séparés par des virgules, dans l'ordre de la
-- semaine — « mon,thu ». NULL ou vide = pas d'ensemble, et la règle
-- hebdomadaire reste ancrée sur la date de la tâche : c'est exactement le
-- comportement d'avant, donc aucun backfill n'est nécessaire.
--
-- L'ensemble ne vaut que pour `weekly`. Combiné à `recur_interval`, il
-- l'ignore : « un lundi sur deux et un jeudi sur deux » n'a pas de lecture
-- unique, et `weekdays` prend déjà le même parti (voir `advance`).

ALTER TABLE todos ADD COLUMN recur_weekdays TEXT;
