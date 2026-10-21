# Plan 001 : Un CLAUDE.md à la racine donne aux agents les règles du projet

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- CLAUDE.md AGENTS.md package.json .gitattributes vitest.config.ts`
> Si un de ces fichiers a changé depuis l'écriture du plan, compare les extraits
> de « État actuel » au code réel ; en cas d'écart, c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : S
- **Risque** : LOW
- **Dépend de** : aucun
- **Catégorie** : dx
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Les autres plans de ce dossier seront exécutés par des agents qui ne
connaissent pas le projet. Les règles qui évitent les erreurs coûteuses sont
aujourd'hui éparpillées dans des commentaires de code et des documents
(migrations à ne jamais modifier, événements à émettre après chaque écriture,
code macOS compilé seulement sur GitHub, tests qui ne résolvent pas `@/`…).
Un `CLAUDE.md` à la racine est lu automatiquement par Claude Code au démarrage :
il met ces règles sous les yeux de chaque agent, une fois pour toutes.

## État actuel

- Il n'existe **ni** `CLAUDE.md` **ni** `AGENTS.md` à la racine
  (`ls CLAUDE.md AGENTS.md` → « No such file »).
- Langue du dépôt : **français** pour les commentaires, les textes de
  l'interface et beaucoup d'identifiants (`cadre`, `feuille`, `BarreTache`,
  `teintes`). Les messages de commit sont en **anglais**, style
  « conventional commits ». Exemples réels (`git log`) :
  - `fix(switch): the thumb takes the colour written on the accent`
  - `feat(theme): six inks, chosen by rules instead of by eye`
  - `refactor(planner): remove the section layouts unplugged in Phase O`
- Scripts (`package.json:17-24`) :
  ```json
  "dev": "next dev --turbopack --hostname localhost",
  "build": "next build",
  "lint": "next lint",
  "test": "vitest run",
  "typecheck": "tsc --noEmit --incremental false",
  "check": "pnpm test && pnpm typecheck"
  ```
  `pnpm check` ne lance **ni** le lint **ni** les tests Rust.
- Tests Rust : `cd src-tauri && cargo test`. **Ils régénèrent aussi les types
  TypeScript partagés** : les modèles Rust portent
  `#[ts(export, export_to = "../../features/<module>/generated/")]`
  (ex. `src-tauri/src/models/ai.rs:9`), écrits dans `features/*/generated/`.
  Ces fichiers ne s'éditent jamais à la main.
- Toute la SQL vit côté Rust (sqlx, `src-tauri/src/db.rs`) ; le webview appelle
  des commandes Tauri. Après chaque écriture, Rust émet un événement que toutes
  les fenêtres écoutent pour se rafraîchir (`src-tauri/src/commands.rs`) :
  `todos:changed` (l.15), `journal:changed` (l.131), `projects:changed`
  (l.1120), `tags:changed` (l.1227). Les mêmes constantes existent côté TS dans
  `features/{todos,journal,projects,tags}/api.ts`.
- Migrations : `src-tauri/migrations/NNNN_*.sql`, embarquées avec une empreinte
  de leurs octets. `.gitattributes` impose `*.sql text eol=lf`. Une migration
  déjà publiée ne se modifie **jamais** (l'app refuserait d'ouvrir la base) ; on
  en ajoute une nouvelle. Voir le commentaire `db.rs:58-68`.
- Code macOS : `src-tauri/src/cadre/macos.rs`, derrière
  `#[cfg(target_os = "macos")]` (`src-tauri/src/cadre/mod.rs:27-28`). Il ne
  compile pas sous Windows : seul le job « macOS build » de
  `.github/workflows/verify.yml` le vérifie (après un `git push`).
- Tests front : `vitest.config.ts` n'a **pas** d'alias `@/` et n'inclut que
  `lib/**/*.test.ts` et `features/**/*.test.ts`. Un module atteint depuis un
  test doit importer en relatif. Exemple de contournement existant
  (`features/journal/PieceNode.tsx:22-24`) :
  ```ts
  // Import RELATIF, pas `@/` : vitest ne resout pas l alias, et ce fichier est
  // atteint depuis `feuille.test.ts` par la chaine des transformeurs.
  import { SWR_KEYS } from "../../lib/swr-config";
  ```
- Design : référence `docs/DESIGN-SYSTEM.md`. Règles qui piègent souvent :
  - couleur d'accent en texte → `text-brand-text`, jamais `text-brand`
    (section 2.2) ; les règles de contraste des accents sont vérifiées par
    `lib/accents.test.ts` ;
  - icônes produit via `AppIcon` (`components/ui/app-icon.tsx` : « Le point
    d'entrée unique des icônes produit », Hugeicons) ; Lucide reste dans les
    primitives shadcn de `components/ui/` ;
  - `components/TitleBar.tsx` et le système de révélation de `app/layout.tsx`
    sont **verrouillés** (DESIGN-SYSTEM.md §4.1 « NE PAS TOUCHER »).
- Notes de version : `NOUVEAUTES.md`, règles en commentaire en tête du fichier
  (une section `## X.Y.Z — AAAA-MM-JJ`, résumé en `> …`, rubriques Nouveau /
  Amélioré / Corrigé, écrit pour les utilisateurs, au vouvoiement).
- Débogage de l'app réelle : skill `.claude/skills/debug-listik/SKILL.md`
  (CDP sur WebView2). Piège noté là : sous Windows, arrêter `pnpm tauri dev`
  laisse parfois `app.exe`/`cargo.exe` orphelins ; ne jamais tuer par nom seul.
- Décisions déjà prises (à ne pas « corriger ») :
  - le dossier `sidecar/` (Python) est gardé comme projet d'apprentissage,
    débranché (`docs/ROADMAP-PIVOT.md:22-24`, `:287`) ;
  - la capture de tâche garde Groq, appelé directement depuis Rust
    (`docs/ROADMAP-PIVOT.md:25-26`) ;
  - la dette de schéma sans interface (`headings`/`heading_id`,
    `tags.parent_id`, colonne `list`) est hors périmètre
    (`docs/ROADMAP-PIVOT.md:56-58`) ;
  - pas de bouton « annuler » dans la bulle de réflexion de la barre rapide
    (`docs/ROADMAP-BARRES.md:212-215`, décision utilisateur) ;
  - on ne supprime pas de code ou de fonctionnalité sans décision explicite de
    l'utilisateur.

## Commandes utiles

| But | Commande | Attendu |
|---|---|---|
| Tests front + types | `pnpm check` | exit 0 |
| Lint | `pnpm lint` | « No ESLint warnings or errors » |
| Fichier créé | `test -f CLAUDE.md && echo ok` | `ok` |

## Périmètre

**Dans le périmètre** (seul fichier à créer) :
- `CLAUDE.md` (créer, à la racine du dépôt)

**Hors périmètre** :
- `AGENTS.md` — ne pas créer de second fichier : un seul à tenir à jour.
- Tout code, toute config (`vitest.config.ts`, workflows…) : ce plan documente
  l'existant, il ne le change pas. Les défauts constatés (alias vitest, lint
  absent de la CI) ont leurs propres plans ou n'en ont pas encore.
- `docs/*.md` : ne pas les réécrire ; y renvoyer.

## Git

- Branche : `advisor/001-claude-md`
- Un commit, style du dépôt :
  `docs: add CLAUDE.md with the project's rules for agents`
- Ne pas pousser, ne pas ouvrir de PR sauf instruction de l'opérateur.

## Étapes

### Étape 1 : Écrire `CLAUDE.md`

Crée `CLAUDE.md`, en français, court (viser 80 à 140 lignes), avec exactement
ces sections de niveau 2, dans cet ordre, remplies avec les faits de « État
actuel » ci-dessus (ne rien inventer qui n'y figure pas) :

1. `## Commandes` — installer (`pnpm install --frozen-lockfile`), lancer
   (`pnpm tauri dev` ; un changement Rust demande de relancer le binaire),
   vérifier (`pnpm check` = vitest + tsc seulement ; `pnpm lint` ;
   `cd src-tauri && cargo test`), construire (`pnpm build`). Dire que
   `pnpm check` ne couvre ni le lint ni Rust.
2. `## Architecture` — Rust possède toute la SQL ; chaque écriture émet
   l'événement de son domaine (les quatre noms) ; les types partagés sont
   générés par `cargo test` dans `features/*/generated/` et ne s'éditent pas
   à la main ; après un changement de modèle Rust, lancer `cargo test` puis
   committer les fichiers générés.
3. `## Migrations` — ajout seulement, jamais de modification d'une migration
   existante, fins de ligne LF (`.gitattributes`).
4. `## macOS` — le code `#[cfg(target_os = "macos")]` ne se vérifie que sur
   GitHub (job « macOS build ») ; pousser la branche et lire le résultat avant
   de dire qu'un changement macOS fonctionne.
5. `## Tests` — périmètre de vitest (`lib/`, `features/`, `.test.ts`), pas
   d'alias `@/` : imports relatifs dans tout module atteint par un test (citer
   l'exemple de `PieceNode.tsx`) ; préférer extraire la logique pure dans un
   module testable plutôt que tester des composants React.
6. `## Conventions` — français pour commentaires, interface et noms ; commits
   en anglais style conventional commits (donner deux exemples réels) ;
   design : renvoyer à `docs/DESIGN-SYSTEM.md` et lister les trois règles
   piégeuses (texte d'accent, `AppIcon`, TitleBar verrouillée) ; notes de
   version dans `NOUVEAUTES.md` selon ses règles ; un changement visible par
   l'utilisateur met aussi à jour `docs/GUIDE-UTILISATEUR.md`.
7. `## Décisions à respecter` — les cinq décisions listées dans « État
   actuel », chacune avec son document de référence.
8. `## Déboguer l'app réelle` — renvoyer au skill `debug-listik` et rappeler
   le piège des processus orphelins sous Windows.

**Vérifier** :
`grep -c "^## " CLAUDE.md` → `8`

### Étape 2 : Vérifier que chaque chemin cité existe

Chaque chemin de fichier écrit entre backticks dans `CLAUDE.md` doit exister.
Lance (Git Bash) :

```bash
grep -oE '`[A-Za-z0-9_./-]+\.(md|ts|tsx|rs|json|sql|yml|mjs)`' CLAUDE.md \
  | tr -d '`' | sort -u | while read -r p; do [ -e "$p" ] || echo "MANQUE: $p"; done
```

**Vérifier** : la commande n'affiche aucune ligne `MANQUE:`. (Les motifs
génériques comme `features/*/generated/` ne sont pas concernés par ce grep.)

### Étape 3 : Vérifier que chaque script cité existe

**Vérifier** :
`node -e "const s=require('./package.json').scripts; for (const k of ['dev','build','lint','test','typecheck','check']) if(!s[k]) {console.log('MANQUE', k); process.exitCode=1}"`
→ aucune sortie, exit 0.

## Plan de test

Pas de test automatique : c'est de la documentation. Les étapes 2 et 3 servent
de vérification mécanique.

## Critères de fin

- [ ] `test -f CLAUDE.md` réussit et `test -f AGENTS.md` échoue (un seul fichier)
- [ ] `grep -c "^## " CLAUDE.md` → `8`
- [ ] L'étape 2 n'affiche aucun `MANQUE:`
- [ ] `grep -n "text-brand-text" CLAUDE.md` trouve au moins une ligne
- [ ] `grep -n "eol=lf\|LF" CLAUDE.md` trouve au moins une ligne
- [ ] `git status --short` ne montre que `CLAUDE.md` (et `plans/README.md`)
- [ ] La ligne du plan 001 est à jour dans `plans/README.md`

## Conditions d'arrêt

- Un `CLAUDE.md` ou `AGENTS.md` existe déjà à la racine : ne pas l'écraser,
  rendre compte.
- Un des faits de « État actuel » est faux dans le dépôt (un script absent, un
  événement renommé, `vitest.config.ts` qui a gagné un alias…) : rendre
  compte plutôt que d'écrire une règle fausse.

## Notes de maintenance

- Ce fichier vieillit avec le projet : quand l'alias vitest sera ajouté, ou le
  lint ajouté à la CI, retirer la règle devenue fausse dans la même modification.
- Un relecteur doit vérifier qu'aucune règle n'a été inventée (tout doit venir
  de « État actuel ») et que le fichier reste court : un CLAUDE.md long cesse
  d'être lu.
