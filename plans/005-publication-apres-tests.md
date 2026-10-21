# Plan 005 : Une version n'est publiée que si les tests passent sur la machine qui la construit

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- .github/workflows/release.yml .github/workflows/verify.yml package.json`
> Si un de ces fichiers a changé depuis l'écriture du plan, compare les extraits
> de « État actuel » au fichier réel ; en cas d'écart, c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : S
- **Risque** : LOW
- **Dépend de** : aucun
- **Catégorie** : dx
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Pousser un tag `v*` lance `.github/workflows/release.yml`, qui construit
l'application, la signe et publie le fichier de mise à jour automatique : tous
les utilisateurs se voient proposer la nouvelle version. Ce workflow ne lance
**aucun** test. Les tests existent (`pnpm check`, `cargo test`) mais vivent
dans un autre workflow (`verify.yml`) dont la publication n'attend pas le
résultat. Un tag posé sur un commit cassé publie donc une version cassée. Ce
plan ajoute les tests dans la publication, avant la construction : s'ils
échouent, rien n'est publié.

## État actuel

`.github/workflows/release.yml` (extrait, l.1-80). Déclenché par
`push: tags: ["v*"]`, un job `publish` en matrice Windows + macOS
(`fail-fast: false`). Étapes, dans l'ordre :

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust-targets }}
      - run: pnpm install --frozen-lockfile
      - name: Verify that the tag matches the application version
        shell: pwsh
        run: |
          …
      - name: Release notes
        id: notes
        shell: bash
        run: |
          …
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          …
```

Modèle à copier : `.github/workflows/verify.yml:27-30`, qui lance déjà
exactement ces tests :

```yaml
      - run: pnpm check
      - run: pnpm build
      - run: cargo test
        working-directory: src-tauri
```

(`pnpm check` = `pnpm test && pnpm typecheck`, défini dans `package.json`.)

Conventions du fichier : commentaires en français au-dessus des étapes qui
le méritent (voir ceux de « Release notes » et de la matrice).

## Commandes utiles

| But | Commande | Attendu |
|---|---|---|
| YAML valide | `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8')); print('ok')"` | `ok` |
| Ordre des étapes | voir étape 2 | `ok` |

Si `python` ou le module `yaml` n'est pas disponible, note-le dans ton compte
rendu et passe ces vérifications (ne rien installer).

## Périmètre

**Dans le périmètre** :
- `.github/workflows/release.yml`

**Hors périmètre** :
- `.github/workflows/verify.yml` — inchangé.
- Épingler les actions sur des empreintes de commit, isoler la clé de
  signature, passer de Node 20 à 22 : utiles, mais d'autres chantiers.
- Ajouter un contrôle des types générés (`features/*/generated`) : autre
  chantier.
- Ne **jamais** pousser de tag pour « tester » : un tag publie une vraie
  version à tous les utilisateurs.

## Git

- Branche : `advisor/005-publication-apres-tests`
- Commit : `ci(release): run the tests before building a release`
- Ne pas pousser, ne pas ouvrir de PR, ne créer aucun tag sauf instruction
  explicite de l'opérateur.

## Étapes

### Étape 1 : Ajouter les tests avant la construction

Dans `.github/workflows/release.yml`, insère **entre** l'étape
`- name: Release notes` (et son bloc `run`) et l'étape
`- uses: tauri-apps/tauri-action@v0` :

```yaml
      # Une version part chez tous les utilisateurs par la mise à jour
      # automatique : elle ne se construit pas sur un commit que les tests
      # refusent. Mêmes contrôles que `verify.yml`, sur la machine même qui
      # construit (le code macOS ne se vérifie que sur un Mac).
      - name: Tests
        run: pnpm check
      # Les tests Rust compilent `tauri::generate_context!`, qui lit le site
      # construit (`out/`) : il faut donc le construire avant, comme
      # `verify.yml`. tauri-action le reconstruira ensuite ; c'est voulu.
      - name: Build the frontend for the Rust tests
        run: pnpm build
      - name: Rust tests
        run: cargo test
        working-directory: src-tauri
```

Respecte l'indentation des autres étapes (6 espaces avant `- name`). Ne
retire aucune des trois étapes : `verify.yml` les enchaîne dans cet ordre
précis (`pnpm check`, `pnpm build`, `cargo test`).

**Vérifier** : la commande « YAML valide » → `ok`.

### Étape 2 : Vérifier l'ordre

Lance :

```bash
python - <<'EOF'
import yaml
wf = yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8'))
steps = wf['jobs']['publish']['steps']
def idx(pred):
    return next(i for i, s in enumerate(steps) if pred(s))
i_tests = idx(lambda s: s.get('run') == 'pnpm check')
i_front = idx(lambda s: s.get('run') == 'pnpm build')
i_rust = idx(lambda s: s.get('run') == 'cargo test' and s.get('working-directory') == 'src-tauri')
i_build = idx(lambda s: str(s.get('uses', '')).startswith('tauri-apps/tauri-action'))
i_install = idx(lambda s: s.get('run') == 'pnpm install --frozen-lockfile')
assert i_install < i_tests < i_front < i_rust < i_build, (i_install, i_tests, i_front, i_rust, i_build)
print('ok')
EOF
```

**Vérifier** : affiche `ok`.

### Étape 3 : Rien d'autre n'a bougé

**Vérifier** : `git diff --stat` → une seule ligne de fichier,
`.github/workflows/release.yml`, avec uniquement des ajouts
(`git diff --numstat .github/workflows/release.yml` → la 2ᵉ colonne, les
suppressions, vaut `0`).

## Plan de test

- Pas de test automatique local : un workflow GitHub ne s'exécute que sur
  GitHub. Les étapes 1 à 3 vérifient la forme et l'ordre.
- Vérification réelle, **à faire par l'opérateur, pas par l'exécutant** : à la
  prochaine publication, l'onglet Actions du dépôt doit montrer les étapes
  « Tests » et « Rust tests » réussies avant « tauri-apps/tauri-action », pour
  Windows et pour macOS.

## Critères de fin

- [ ] Le YAML se charge (`ok`)
- [ ] Le script de l'étape 2 affiche `ok`
- [ ] `git diff --numstat` : seul `release.yml`, 0 suppression
- [ ] Aucun tag créé, rien de poussé
- [ ] La ligne du plan 005 est à jour dans `plans/README.md`

## Conditions d'arrêt

- `release.yml` ne contient plus l'étape `tauri-apps/tauri-action` ou les
  étapes ont été réorganisées : rendre compte.
- Le job ne s'appelle plus `publish` (le script de l'étape 2 échouerait) :
  rendre compte plutôt que d'adapter le script à l'aveugle.
- Quelqu'un te demande de vérifier en poussant un tag : refuser et rendre
  compte — un tag publie une vraie version.

## Notes de maintenance

- La publication prend quelques minutes de plus (le site est construit deux
  fois, et les tests Rust compilent en mode debug en plus du build de
  version). C'est le prix voulu.
- Si `verify.yml` gagne un jour d'autres contrôles (lint, types générés),
  les reporter ici aussi : la publication doit être au moins aussi exigeante
  que la vérification ordinaire.
- Reporté : épingler les actions sur des empreintes de commit et ne donner la
  clé de signature qu'à l'étape qui signe (durcissement de la chaîne de
  publication).
