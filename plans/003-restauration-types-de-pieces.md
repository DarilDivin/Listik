# Plan 003 : La restauration n'accepte que les types de pièces jointes que Listik sait ranger

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- src-tauri/src/commands.rs src-tauri/src/db.rs`
> Si un de ces fichiers a changé depuis l'écriture du plan, compare les extraits
> de « État actuel » au code réel ; en cas d'écart, c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : S
- **Risque** : LOW
- **Dépend de** : aucun
- **Catégorie** : security
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Une sauvegarde Listik est un fichier qu'on peut recevoir, copier, synchroniser.
Quand on joint normalement un fichier au journal, Listik refuse tout ce qui
n'est pas une image, un PDF, une note vocale ou un document de bureau. La
**restauration**, elle, ne refait pas ce contrôle : une sauvegarde fabriquée
peut placer un programme (`.exe`, `.bat`, `.hta`…) dans le dossier des pièces,
avec une fiche qui l'affiche sous un nom de PDF. Le bouton « Ouvrir » de la
pièce demande alors au système d'exploitation de l'ouvrir — c'est-à-dire de
l'exécuter. Ce plan fait appliquer à la restauration la même liste autorisée
qu'à l'ajout normal, et refuse toute la restauration au moindre écart.

## État actuel

- `src-tauri/src/db.rs:1125-1146` — la liste autorisée, utilisée par l'ajout
  normal (`create_journal_piece`, `db.rs:1159-1161`) :
  ```rust
  pub fn nature(nom: &str) -> Option<&'static str> {
      let ext = std::path::Path::new(nom)
          .extension()
          .and_then(|e| e.to_str())?
          .to_ascii_lowercase();
      if IMAGES.contains(&ext.as_str()) { return Some("image"); }
      if ext == "pdf" { return Some("pdf"); }
      if ext == "webm" { return Some("voix"); }
      if DOCUMENTS.contains(&ext.as_str()) { return Some("document"); }
      None
  }
  ```
  (`IMAGES` et `DOCUMENTS` sont définis juste au-dessus, `db.rs:1103-1113`.)
- `src-tauri/src/commands.rs:783-790` — l'extension retenue à la
  restauration n'est filtrée que sur sa forme (lettres et chiffres, ≤ 10) :
  ```rust
  fn extension_sure(nom: &str) -> Option<String> {
      std::path::Path::new(nom)
          .extension()
          .and_then(|ext| ext.to_str())
          .filter(|ext| !ext.is_empty() && ext.len() <= 10 && ext.chars().all(|c| c.is_ascii_alphanumeric()))
          .map(str::to_ascii_lowercase)
  }
  ```
- `src-tauri/src/commands.rs:770-781` — `verifier_piece_sauvee(id, fichier)` :
  contrôle déjà que l'identifiant et le nom de fichier ne sortent pas du
  dossier. **À garder tel quel.**
- `src-tauri/src/commands.rs:975-1003` — dans `restore_backup` :
  ```rust
  for piece in &backup.pieces {
      verifier_piece_sauvee(&piece.fiche.id, piece.fichier.as_deref())?;
  }
  for piece in &backup.pieces {
      if let Some(file) = &piece.fichier {
          let source = source_pieces.join(file);
          if !source.is_file() {
              return Err(format!("pièce jointe introuvable dans la sauvegarde : {file}"));
          }
      }
  }
  // …
  for piece in &backup.pieces {
      let Some(file) = &piece.fichier else { continue };
      let ext = extension_sure(file)
          .or_else(|| extension_sure(&piece.fiche.nom_origine))
          .unwrap_or_else(|| "bin".to_string());
      let target_file = format!("{}.{}", piece.fiche.id, ext);
      std::fs::copy(source_pieces.join(file), staging.join(&target_file))
          .map_err(|e| format!("copie de pièce impossible : {e}"))?;
      imported_pieces.push((piece, target_file));
  }
  ```
  Puis `commands.rs:1075-1081` insère `kind` et `nom_origine` **tels que lus
  dans le JSON**.
- `src-tauri/capabilities/default.json:47-53` autorise la page à ouvrir avec
  le système n'importe quel fichier de `$APPDATA/pieces/*`, et
  `features/journal/PieceNode.tsx:526-538` appelle `openPath(piece.chemin)`
  pour toute pièce non-image, avec `nom_origine` comme libellé.
- Ce qu'écrit une sauvegarde légitime (`commands.rs:889-905`) : chaque fichier
  est nommé d'après `nom_origine` (`db::nom_unique`), donc son extension est
  celle du nom d'origine ; et toute pièce a été créée par
  `create_journal_piece`, donc `nature(nom_origine) == kind`. Les notes
  vocales s'appellent `note-vocale-AAAA-MM-JJ-HHhMM.webm` (`kind = "voix"`).
  **Conclusion : une sauvegarde faite par Listik passe toujours la règle
  « `nature(fichier) == nature(nom_origine) == kind` ».**
  Vérifié aussi sur l'historique : `nature()` a toujours été appliquée à la
  création (`git log -S "fn nature" -- src-tauri/src/db.rs` → `53ce870`, images
  seules), puis la liste n'a fait que s'allonger — PDF et documents en
  `715b426`, voix (`webm`) en `a2aaf94` — sans jamais reclasser un type
  existant. Les migrations `0017` à `0020` ne touchent pas à `kind`. Une
  sauvegarde faite par une version plus ancienne passe donc la règle.
- `source.is_file()` **suit** les liens symboliques : un lien placé dans le
  dossier de la sauvegarde ferait copier n'importe quel fichier de la machine.
- Test existant à étendre, modèle de style : `commands.rs:1418-1437`,
  `fn une_sauvegarde_ne_peut_pas_sortir_du_dossier_des_pieces()` dans
  `mod tests` (`commands.rs:1405`).
- Commentaires en français, au ton des commentaires voisins (phrases
  complètes qui expliquent le *pourquoi*).

## Commandes utiles

(Depuis la racine du dépôt.)

| But | Commande | Attendu |
|---|---|---|
| Test ciblé | `cd src-tauri && cargo test sauvegarde` | tous passent |
| Tous les tests Rust | `cd src-tauri && cargo test` | `test result: ok` partout |
| Front | `pnpm check` | exit 0 |

Note : `cargo test` régénère les types de `features/*/generated/`. Ce plan ne
touche aucun modèle : aucun de ces fichiers ne doit changer.

## Périmètre

**Dans le périmètre** :
- `src-tauri/src/commands.rs` — une fonction de contrôle, son appel dans
  `restore_backup`, ses tests.

**Hors périmètre** :
- `src-tauri/src/db.rs` — `nature()` est réutilisée telle quelle ; ne pas
  élargir ni réduire la liste.
- `src-tauri/capabilities/default.json` et `PieceNode.tsx` — restreindre
  l'ouverture elle-même est un second rempart utile, mais un autre chantier.
- Les fiches de pièces **sans fichier** (`fichier: None`) : la restauration les
  ignore aujourd'hui ; ne pas changer ce comportement ici.
- La clé Groq, le dossier temporaire laissé en cas d'échec, l'événement
  `tags:changed` après restauration : défauts réels, mais d'autres plans.

## Git

- Branche : `advisor/003-restauration-types`
- Commit : `fix(backup): a restored attachment must be a type Listik accepts`
- Ne pas pousser, ne pas ouvrir de PR sauf instruction de l'opérateur.

## Étapes

### Étape 1 : Écrire la fonction de contrôle

Dans `src-tauri/src/commands.rs`, juste après `extension_sure` (l.790),
ajoute :

```rust
/// La pièce d'une sauvegarde est-elle de celles que Listik range ?
///
/// Un ajout normal passe par `db::nature` ; une restauration doit passer par
/// la même porte. Sinon une sauvegarde fabriquée glisse un programme dans le
/// dossier des pièces, sous un nom de PDF, et « Ouvrir » le lance. Le fichier,
/// le nom affiché et la nature notée doivent tous trois dire la même chose —
/// c'est toujours le cas d'une sauvegarde écrite par Listik.
///
/// Rend l'extension (en minuscules) sous laquelle copier le fichier.
fn controler_piece_restauree(kind: &str, nom_origine: &str, fichier: &str) -> Result<String, String> {
    let nature_fichier = db::nature(fichier);
    let nature_nom = db::nature(nom_origine);
    match (nature_fichier, nature_nom) {
        (Some(a), Some(b)) if a == kind && b == kind => {}
        _ => return Err(format!("pièce refusée dans la sauvegarde : « {nom_origine} » ({fichier})")),
    }
    extension_sure(fichier).ok_or_else(|| format!("pièce refusée dans la sauvegarde : {fichier}"))
}
```

**Vérifier** : `cd src-tauri && cargo build` → compile (un avertissement
« function is never used » est attendu à ce stade).

### Étape 2 : Contrôler toutes les pièces AVANT la première écriture

Dans `restore_backup`, dans la deuxième boucle de vérification
(`for piece in &backup.pieces { if let Some(file) = &piece.fichier { … } }`,
l.978-985), remplace le test `source.is_file()` par :

```rust
controler_piece_restauree(&piece.fiche.kind, &piece.fiche.nom_origine, file)?;
let source = source_pieces.join(file);
// `symlink_metadata` ne suit PAS les liens : un lien placé dans le dossier de
// la sauvegarde ferait sinon copier n'importe quel fichier de la machine.
let est_fichier = std::fs::symlink_metadata(&source)
    .map(|m| m.file_type().is_file())
    .unwrap_or(false);
if !est_fichier {
    return Err(format!("pièce jointe introuvable dans la sauvegarde : {file}"));
}
```

Ce contrôle a lieu avant toute écriture : une seule pièce refusée, et rien
n'est restauré (c'est déjà le principe de cette boucle, cf. le commentaire
« Tout est vérifié avant la première écriture »).

**Vérifier** : `cd src-tauri && cargo build` → compile.

### Étape 3 : Copier sous l'extension contrôlée

Dans la boucle de copie (l.994-1003), remplace le calcul de `ext` (les trois
lignes `extension_sure(file).or_else(…).unwrap_or_else(…)`) par :

```rust
let ext = controler_piece_restauree(&piece.fiche.kind, &piece.fiche.nom_origine, file)?;
```

Il n'y a plus de repli `bin` : une pièce qui arrive ici a déjà été acceptée à
l'étape 2.

**Vérifier** : `cd src-tauri && cargo build` → compile **sans** avertissement
nouveau.

### Étape 4 : Tester

Dans `mod tests` de `commands.rs`, ajoute après
`une_sauvegarde_ne_peut_pas_sortir_du_dossier_des_pieces` :

```rust
#[test]
fn une_sauvegarde_ne_restaure_que_les_pieces_que_listik_range() {
    use super::controler_piece_restauree as ok;
    // Ce qu'écrit Listik : accepté, extension rendue en minuscules.
    assert_eq!(ok("image", "Photo.JPG", "Photo.JPG").as_deref(), Ok("jpg"));
    assert_eq!(ok("pdf", "bail.pdf", "bail (2).pdf").as_deref(), Ok("pdf"));
    assert_eq!(ok("voix", "note-vocale-2026-10-21-09h30.webm", "note-vocale-2026-10-21-09h30.webm").as_deref(), Ok("webm"));
    assert_eq!(ok("document", "budget.xlsx", "budget.xlsx").as_deref(), Ok("xlsx"));
    // Un programme, même déguisé : refusé.
    assert!(ok("document", "facture.pdf", "facture.exe").is_err());
    assert!(ok("document", "x.bat", "x.bat").is_err());
    assert!(ok("document", "page.html", "page.html").is_err());
    // Un nom affiché qui ment sur le type : refusé.
    assert!(ok("document", "facture.pdf", "facture.docx").is_err());
    // Une nature notée qui ne correspond pas au fichier : refusée.
    assert!(ok("image", "bail.pdf", "bail.pdf").is_err());
    // Sans extension : refusé.
    assert!(ok("document", "sans-extension", "sans-extension").is_err());
}
```

**Vérifier** : `cd src-tauri && cargo test sauvegarde` → les deux tests
`une_sauvegarde_…` passent.

### Étape 5 : Vérification d'ensemble

**Vérifier** :
- `cd src-tauri && cargo test` → tout passe
- `git status --short` → seul `src-tauri/src/commands.rs` est modifié
  (+ `plans/README.md`) ; **aucun** fichier de `features/*/generated/`
- `pnpm check` → exit 0

## Plan de test

- Nouveau test `une_sauvegarde_ne_restaure_que_les_pieces_que_listik_range`
  (étape 4), au style de `une_sauvegarde_ne_peut_pas_sortir_du_dossier_des_pieces`.
- Pas de test automatique du lien symbolique : en créer un sous Windows exige
  des droits particuliers. Le relecteur vérifie le code de l'étape 2 à la main.
- Facultatif, si l'opérateur le demande : dans l'app (`pnpm tauri dev`),
  Réglages → Données → exporter une sauvegarde avec au moins une photo et un
  PDF, puis la restaurer : elle doit réussir (non-régression).

## Critères de fin

- [ ] `cd src-tauri && cargo test` → tout passe, dont le nouveau test
- [ ] `grep -n "unwrap_or_else(|| \"bin\"" src-tauri/src/commands.rs` → aucune ligne
- [ ] `grep -n "symlink_metadata" src-tauri/src/commands.rs` → au moins une ligne
- [ ] `grep -c "controler_piece_restauree(" src-tauri/src/commands.rs` → au moins 3 (définition + 2 appels, + test)
- [ ] `git status --short` : seulement `src-tauri/src/commands.rs` (+ `plans/README.md`)
- [ ] La ligne du plan 003 est à jour dans `plans/README.md`

## Conditions d'arrêt

- `restore_backup` ne ressemble plus aux extraits (boucles déplacées, contrôle
  déjà ajouté) : rendre compte.
- `db::nature` n'est pas accessible depuis `commands.rs` (pas `pub`) ou a
  changé de signature : rendre compte, ne pas la modifier.
- `cargo test` modifie des fichiers de `features/*/generated/` : rendre compte
  (cela signifie que les modèles Rust ont changé ailleurs, hors de ce plan).
- Un test existant de restauration ou d'export échoue après le changement.
- Une sauvegarde **réelle** (faite par Listik, ancienne ou récente) est
  refusée par la nouvelle règle, lors de la vérification facultative ou d'un
  retour de l'opérateur : rendre compte. La règle devra alors s'assouplir
  (refuser seulement si `nature(fichier)` vaut `None`, et recalculer `kind`
  depuis le fichier) plutôt que d'être contournée.

## Notes de maintenance

- Si la liste des types acceptés s'élargit un jour (`db.rs` : `IMAGES`,
  `DOCUMENTS`, `nature`), la restauration suit automatiquement.
- Second rempart, reporté : limiter l'autorisation `opener:allow-open-path`
  (`capabilities/default.json`) aux extensions autorisées, ou ouvrir les pièces
  via une commande Rust qui relit la nature depuis la base.
- À relire avec attention : que la vérification se fait bien dans la boucle
  qui précède toute écriture (pas seulement dans la boucle de copie).
