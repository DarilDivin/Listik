-- La première page d'un PDF, rendue en image à l'ajout et rangée à côté du
-- fichier.
--
-- Rendue UNE FOIS, et non à chaque affichage : la journée se relit souvent,
-- le PDF ne change jamais. L'affichage redevient ainsi une simple image — le
-- moteur de rendu (pdf.js) ne pèse que sur le geste d'attacher.
--
-- Les deux colonnes sont NULLABLES, et pas par prudence : un PDF protégé par
-- mot de passe ne se rend pas, et un PDF attaché avant cette migration n'a
-- jamais eu de vignette. Sans aperçu, la pièce retombe sur la rangée nue —
-- qui reste juste.
ALTER TABLE journal_pieces ADD COLUMN apercu TEXT;
ALTER TABLE journal_pieces ADD COLUMN pages INTEGER;
