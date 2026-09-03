-- Recherche plein texte du journal.
--
-- Un journal qu'on ne peut pas fouiller ne sert qu'a ecrire, jamais a relire :
-- c'est ce qui manquait le plus une fois la page-jour finie.
--
-- Table EXTERNE (`content=`) : l'index ne garde pas une copie du texte, il
-- pointe la ligne d'origine par son rowid. Les colonnes doivent donc porter le
-- meme nom que dans la table source.
--
-- `remove_diacritics 2` : « epicerie » trouve « Épicerie ». Sans lui la
-- recherche semblerait cassee a la moindre lettre accentuee — dans une app en
-- francais, c'est la difference entre une recherche qui marche et une qui ne
-- marche pas.
CREATE VIRTUAL TABLE journal_fts USING fts5(
    content,
    content='journal_entries',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

-- L'index suit la table, sans que le code applicatif ait a y penser : une
-- ecriture oubliee ici serait un passage introuvable, et rien ne le dirait.
CREATE TRIGGER journal_fts_apres_insert AFTER INSERT ON journal_entries BEGIN
    INSERT INTO journal_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER journal_fts_apres_delete AFTER DELETE ON journal_entries BEGIN
    INSERT INTO journal_fts(journal_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER journal_fts_apres_update AFTER UPDATE ON journal_entries BEGIN
    INSERT INTO journal_fts(journal_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
    INSERT INTO journal_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Ce qui est deja ecrit entre dans l'index : sans cette ligne, la recherche
-- ne trouverait que ce qui sera ecrit APRES la mise a jour.
INSERT INTO journal_fts(rowid, content)
SELECT rowid, content FROM journal_entries;
