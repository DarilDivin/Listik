# Listik

Application de bureau (Tauri 2 : Rust + webview Next.js) pour les tâches et le
journal. Ce fichier donne à tout agent les règles qui évitent les erreurs
coûteuses. Il reste court exprès : le détail vit dans `docs/`.

## Commandes

- Installer : `pnpm install --frozen-lockfile`
- Lancer l'app : `pnpm tauri dev`. Un changement Rust demande de relancer le
  binaire.
- Vérifier le front : `pnpm check` (= vitest + `tsc`, rien d'autre).
- Lint : `pnpm lint`. **`pnpm check` ne lance pas le lint.**
- Tests Rust : `cd src-tauri && cargo test`. **`pnpm check` ne couvre pas Rust.**
- Construire le front : `pnpm build`.

## Architecture

- Toute la SQL vit côté Rust (sqlx, `src-tauri/src/db.rs`). Le webview ne fait
  pas de SQL : il appelle des commandes Tauri.
- Après chaque écriture, Rust émet un événement que toutes les fenêtres
  écoutent pour se rafraîchir (`src-tauri/src/commands.rs`) : `todos:changed`,
  `journal:changed`, `projects:changed`, `tags:changed`. Les mêmes noms existent
  côté TS dans `features/{todos,journal,projects,tags}/api.ts`.
- Les types partagés Rust/TS sont **générés** par `cargo test` (attribut
  `#[ts(export, export_to = "../../features/<module>/generated/")]` sur les
  modèles de `src-tauri/src/models/`). Les fichiers de `features/*/generated/`
  ne s'éditent jamais à la main. Après un changement de modèle Rust : lancer
  `cargo test`, puis committer les fichiers générés.

## Migrations

- Les migrations sont `src-tauri/migrations/NNNN_*.sql`, embarquées avec une
  empreinte de leurs octets.
- Une migration déjà publiée ne se modifie **jamais** (l'app refuserait
  d'ouvrir la base) : on en ajoute une nouvelle. Voir le commentaire de
  `src-tauri/src/db.rs` sur les empreintes.
- Fins de ligne LF : `.gitattributes` impose `*.sql text eol=lf`.

## macOS

Le code macOS (`src-tauri/src/cadre/macos.rs`, derrière
`#[cfg(target_os = "macos")]`) ne compile pas sous Windows. Seul le job
« macOS build » de `.github/workflows/verify.yml` le vérifie, après un
`git push`. Pousser la branche et lire le résultat de ce job avant de dire
qu'un changement macOS fonctionne.

## Tests

- Vitest n'inclut que `lib/**/*.test.ts` et `features/**/*.test.ts`
  (`vitest.config.ts`). Un test placé ailleurs ou nommé autrement ne tourne pas.
- Vitest n'a **pas** d'alias `@/`. Tout module atteint depuis un test doit
  importer en relatif. Exemple existant : `features/journal/PieceNode.tsx` est
  atteint depuis `features/journal/feuille.test.ts` et importe donc en relatif,
  avec un commentaire qui le dit :
  ```ts
  // Import RELATIF, pas `@/` : vitest ne resout pas l alias, […]
  import { SWR_KEYS } from "../../lib/swr-config";
  ```
- Préférer extraire la logique pure dans un module testable plutôt que tester
  des composants React.

## Conventions

- Français pour les commentaires, les textes de l'interface et beaucoup
  d'identifiants (`cadre`, `feuille`, `BarreTache`, `teintes`). Rester dans cette
  langue.
- Messages de commit en **anglais**, style conventional commits. Exemples réels :
  - `fix(switch): the thumb takes the colour written on the accent`
  - `feat(theme): six inks, chosen by rules instead of by eye`
- Design : référence `docs/DESIGN-SYSTEM.md`. Trois règles qui piègent souvent :
  - couleur d'accent en texte → `text-brand-text`, jamais `text-brand`
    (section 2.2) ; les règles de contraste des accents sont vérifiées par
    `lib/accents.test.ts` ;
  - icônes produit via `AppIcon` (`components/ui/app-icon.tsx`, Hugeicons) ;
    Lucide reste dans les primitives shadcn de `components/ui/` ;
  - `components/TitleBar.tsx` et le système de révélation de `app/layout.tsx`
    sont **verrouillés** (DESIGN-SYSTEM.md §4.1 « NE PAS TOUCHER »).
- Notes de version dans `NOUVEAUTES.md`, selon les règles en commentaire en tête
  du fichier : une section `## X.Y.Z — AAAA-MM-JJ`, un résumé en `> …`, les
  rubriques Nouveau / Amélioré / Corrigé, écrit pour les utilisateurs, au
  vouvoiement.
- Un changement visible par l'utilisateur met aussi à jour
  `docs/GUIDE-UTILISATEUR.md`.

## Décisions à respecter

Ces choix sont faits : ne pas les « corriger ».

- Le dossier `sidecar/` (Python) est gardé comme projet d'apprentissage,
  débranché de l'usage réel : `docs/ROADMAP-PIVOT.md`.
- La capture de tâche garde Groq, appelé directement depuis Rust : `docs/ROADMAP-PIVOT.md`.
- La dette de schéma sans interface (`headings`/`heading_id`, `tags.parent_id`,
  colonne `list`) est hors périmètre : `docs/ROADMAP-PIVOT.md`.
- Pas de bouton « annuler » dans la bulle de réflexion de la barre rapide
  (décision de l'utilisateur) : `docs/ROADMAP-BARRES.md`.
- Aucune suppression de code ou de fonctionnalité sans décision explicite de
  l'utilisateur : rien n'est supprimé par défaut, seulement débranché
  (`docs/ROADMAP-PIVOT.md`).

## Déboguer l'app réelle

Pour voir et piloter l'app réelle (capture d'écran, DOM, clics) : skill
`.claude/skills/debug-listik/SKILL.md` (CDP sur WebView2). Piège sous Windows :
arrêter `pnpm tauri dev` laisse parfois `app.exe` et `cargo.exe` orphelins.
Vérifier les processus restants avant de relancer, et ne jamais tuer par nom
seul.
