-- Ce qu'une note vocale porte en plus du fichier : sa durée, et sa silhouette.
--
-- Les deux sont MESURÉES à l'enregistrement, pas relues à l'affichage.
--
-- La durée d'abord parce qu'on ne peut pas la relire : un WebM produit par
-- `MediaRecorder` n'a pas de durée dans son en-tête, et `audio.duration` y
-- répond `Infinity` tant qu'on n'a pas cherché jusqu'au bout du flux.
--
-- Les crêtes ensuite parce que les recalculer demanderait de décoder tout
-- l'audio à chaque ouverture de la journée — pour dessiner une vignette.
-- Une centaine de valeurs entre 0 et 1, en JSON : quelques centaines
-- d'octets, contre plusieurs méga-octets à décoder.
--
-- NULLABLES : une pièce qui n'est pas une voix n'a ni l'une ni l'autre.
ALTER TABLE journal_pieces ADD COLUMN duree_ms INTEGER;
ALTER TABLE journal_pieces ADD COLUMN cretes TEXT;
