-- Le journal ne reçoit pas que des photos : un bail, une facture, un article,
-- un tableur. `journal_pieces` était déjà écrite pour ça — son commentaire
-- annonçait « document » et « voix » — il ne manquait qu'une chose à dire du
-- fichier pour pouvoir le NOMMER sans le montrer : sa taille.
--
-- NULLABLE, et non `DEFAULT 0` : les pièces déjà attachées ont été écrites
-- sans cette colonne, et leur donner 0 octet serait une fausse information
-- affichée à l'écran. Une taille inconnue ne se dit pas, comme un fichier
-- disparu ne s'invente pas.
ALTER TABLE journal_pieces ADD COLUMN taille INTEGER;
