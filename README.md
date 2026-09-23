# Listik

Listik est une application de bureau personnelle pour organiser ses tâches,
tenir un journal et capturer une idée sans quitter son travail. Les données
restent dans une base SQLite locale.

## Utiliser l’application

- **Planificateur** : tâches, projets, domaines, tags, rappels et récurrences.
- **Journal** : pages quotidiennes, pièces jointes, recherche et export Markdown.
- **Fenêtre rapide** : `Alt+Q` ouvre une barre pour capturer une tâche, écrire
  dans le journal ou interroger l’assistant.
- **Assistant** : Claude Code, Codex CLI, Antigravity CLI et OpenCode peuvent
  être détectés puis connectés dans **Réglages → Assistant**. L’accès MCP est
  local et protégé par un jeton éphémère ; les suppressions ne sont pas
  accessibles à l’assistant.
- **Sauvegarde** : **Réglages → Données** exporte un JSON et un dossier de
  pièces jointes. La restauration remplace les données locales après une
  confirmation explicite.

## Développement

Prérequis : Node.js 20+, pnpm et Rust stable avec les dépendances de Tauri
pour votre système.

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

L’application de développement reste ouverte pendant les modifications du
frontend. Les changements Rust demandent une relance du binaire Tauri.

## Vérifier une version

```bash
pnpm check
cd src-tauri
cargo test
cd ..
pnpm tauri build
```

Sous Windows, les installateurs générés se trouvent dans
`src-tauri/target/release/bundle/`. Validez-les sur une machine ou un compte
Windows propre avant publication.

## Publication et mises à jour

La chaîne de publication GitHub, le site de téléchargement et la signature des
mises à jour sont expliqués dans [la documentation de déploiement](docs/DEPLOYMENT.md).
