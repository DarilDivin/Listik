-- Les pièces jointes du journal : ce qu'on pose dans une journée en plus du
-- texte — une photo aujourd'hui, un document et une note vocale ensuite.
--
-- Cette table ne décrit QUE le fichier. Ce qu'on en dit — la légende, la place
-- dans la journée — vit dans le markdown de la reprise, sous la forme
-- `![légende](piece:<id>)`. Deux raisons :
--
--   1. modifier une légende devient une modification du TEXTE : annulable,
--      enregistrée par le même chemin, sans commande de plus ;
--   2. déplacer une image d'un moment à l'autre, c'est déplacer sa ligne — il
--      n'y a pas de lien à réparer derrière.
--
-- Les DIMENSIONS ne sont pas stockées : la règle de taille (« la hauteur,
-- jamais la largeur » — un portrait de téléphone reste étroit, un paysage
-- remplit la colonne) se dit entièrement en CSS. Les mesurer côté Rust aurait
-- demandé une dépendance pour une valeur que le navigateur connaît déjà.
CREATE TABLE journal_pieces (
    id          TEXT PRIMARY KEY,
    -- « image » pour l'instant ; « document » et « voix » suivront.
    kind        TEXT NOT NULL,
    -- Nom sur le disque, dans `<données de l'app>/pieces/`. Toujours un UUID
    -- suivi de l'extension : deux photos nommées `IMG_4821.jpg` ne doivent pas
    -- se recouvrir.
    fichier     TEXT NOT NULL,
    -- Ce que l'utilisateur reconnaît, gardé tel quel — il sert au nom du
    -- fichier à l'export, et à retrouver l'original.
    nom_origine TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
