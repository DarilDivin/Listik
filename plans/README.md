# Plans d'amélioration

Écrits par le skill `improve` le 2026-10-21, sur la branche
`quick-panneau-natif`, commit `7a99d0f`. Chaque plan est autonome : il se lit
et s'exécute sans rien savoir de l'audit qui l'a produit.

Pour chaque exécutant : lire le plan en entier avant de commencer, lancer
d'abord son « contrôle de dérive », respecter ses conditions d'arrêt, et
mettre à jour sa ligne ci-dessous à la fin.

## Avant d'exécuter un plan

- **Base de travail** : la branche `quick-panneau-natif`, ou toute branche qui
  la contient. Vérifier : `git merge-base --is-ancestor 7a99d0f HEAD` doit
  réussir (exit 0). Sur `main` ou `origin/main`, les plans ne s'appliquent pas
  (le système d'accents, `lib/accents.test.ts`, `text-brand-text` n'y existent
  pas encore) : s'arrêter et rendre compte.
- **Ce dossier `plans/` n'est pas commité** : il faut d'abord le copier dans la
  branche de travail (ou le commiter) pour qu'un exécutant le voie, en
  particulier dans un worktree isolé.
- **Ne pas exécuter dans le dossier où tourne `pnpm tauri dev`** : une
  modification Rust y relance l'application de l'utilisateur. Travailler dans
  un worktree ou un clone séparé.

## Ordre d'exécution et statut

| Plan | Titre | Priorité | Effort | Dépend de | Statut |
|------|-------|----------|--------|-----------|--------|
| [001](001-claude-md.md) | Un CLAUDE.md donne aux agents les règles du projet | P1 | S | — | DONE (a176925, sur advisor/integration) |
| [002](002-capture-rapide-recurrence.md) | La capture rapide (Alt+Q) garde la récurrence | P1 | S | — | DONE (2322c9f, sur advisor/integration) |
| [003](003-restauration-types-de-pieces.md) | La restauration n'accepte que les types de pièces autorisés | P1 | S | — | DONE (156a3cd, sur advisor/integration) |
| [004](004-dates-et-rappels.md) | « Demain » suit le vrai jour ; un rappel passé ne sonne plus deux fois | P1 | S | 003 | DONE (8134992, sur advisor/integration) |
| [005](005-publication-apres-tests.md) | Une version n'est publiée que si les tests passent | P1 | S | — | DONE (897ddb0, sur advisor/integration) |
| [006](006-journal-ne-plus-ecraser.md) | La feuille du journal ne réécrit plus du texte qu'elle n'a pas chargé | P1 | M | — | DONE, puis REPRIS le 2026-10-21 : `document.hasFocus()` ment dans WebView2, la page restait périmée et B se perdait encore. L'écriture est désormais arbitrée par Rust (`db::poser_reprise`) ; tests 1 à 3 rejoués dans l'app réelle |

Statuts possibles : TODO | IN PROGRESS | DONE | BLOCKED (avec la raison en
une ligne) | REJECTED (avec la raison en une ligne).

## Dépendances

- **001 d'abord, de préférence** : il met les règles du projet sous les yeux
  des exécutants des plans suivants. Il ne bloque aucun plan.
- **004 après 003** : les deux modifient `restore_backup`
  (`src-tauri/src/commands.rs`), à deux endroits différents. Faits l'un après
  l'autre, ils ne se gênent pas.
- **005 avant la prochaine publication** (tag `v*`).
- **006** est le plus risqué (chemin d'enregistrement du journal) : il demande
  des tests manuels par l'opérateur avant fusion (liste dans le plan).

## Constats de l'audit non encore planifiés

Vérifiés dans le code, mais pas retenus pour cette série. Les reprendre ici
avant un nouvel audit.

- **Assistants IA pas bridés comme annoncé** : OpenCode garde terminal,
  fichiers et web (`src-tauri/src/cli_agent.rs:1185-1201`, config sans bloc de
  permissions) ; Claude Code hérite des réglages globaux et du dossier courant
  (`cli_agent.rs:946-963`). Codex (`:1041`) et Antigravity (`:1102-1109`) sont
  bridés. Sécurité, S–M.
- **Rechargements en double** : chaque composant qui lit les tâches s'abonne à
  `todos:changed` (`features/todos/useTodosSync.ts:15`,
  `hooks/usePlannerTodos.ts:17`, `components/AppSidebar.tsx:67`), et chaque
  ligne de tâche à `projects:changed` (`components/todo/TodoMetaLine.tsx:50`).
  Performance, M, non mesuré.
- **vitest sans alias `@/`, tests jamais vérifiés par TypeScript**
  (`vitest.config.ts`, `tsconfig.json:26`). Outillage, S.
- **Types générés (ts-rs) jamais comparés en CI**, pas de cache Rust
  (`.github/workflows/verify.yml:27-30`). Outillage, S.
- **Paquets Tauri JS en 2.7, crates en 2.11–2.12** (`package.json:40,45` ;
  `src-tauri/Cargo.lock`). Dépendances, S, à valider par un vrai cycle de mise
  à jour.
- **L'assistant écrit des dates non validées** (`cli_agent.rs:208-210`,
  `:356-358`). Bug, S.
- **Guide utilisateur faux** (assistant qui « supprime », restauration
  « absente », Ctrl+K « sémantique » : `docs/GUIDE-UTILISATEUR.md:211`, `:238`,
  `:154`) et **DESIGN-SYSTEM décrivant du code supprimé**
  (`docs/DESIGN-SYSTEM.md:254-268`). Docs, M.
- **Node 20 en fin de vie** dans les workflows (`verify.yml:23,42`,
  `release.yml:37`, `pages.yml:32`). Dépendances, S.
- **Commandes de fichiers qui font confiance aux chemins de la page** ;
  identifiant non vérifié avant l'écriture d'un aperçu (`src-tauri/src/db.rs:1373`).
  Sécurité (second rempart), S–M.
- **Chaîne de publication** : actions non épinglées, clé de signature exposée à
  toute la construction (`release.yml:32-70`). Sécurité, S–M.
- Plus petits : étiquettes du journal chargées une par une à la sauvegarde
  (`db.rs:940-948`) ; manifeste Rust (`rust-version` faux, deux `reqwest`) ;
  `@radix-ui/react-slot` inutilisé ; dates affichées un jour trop tôt à l'ouest
  de l'heure de Greenwich (`components/todo/TodoDate.tsx:16`) ; la restauration
  peut remplacer la clé Groq (`commands.rs:1005-1010`) ; les documents joints
  perdent la marque « venu d'Internet » (`commands.rs:200-202`) ; une
  restauration ratée laisse son dossier temporaire et n'émet pas
  `tags:changed` ; `next lint` supprimé dans Next 16.

## Pistes produit (options, pas des défauts)

- Les notes de l'assistant prolongent la page du jour (`append`) au lieu de
  créer un bloc isolé — question ouverte de `docs/ROADMAP-BARRES.md:326-328`.
- Un bouton « Arrêter » sur la page Assistant (R6 de `docs/ROADMAP-PIVOT.md`,
  jamais construit).
- Trancher la recherche par le sens (Ctrl+K) : la construire ou l'abandonner
  officiellement.
- Importer un journal en Markdown (l'export existe).

## Constats examinés et écartés

- **L'assistant peut réécrire le texte d'une tâche** (`update_todo`) : le
  commentaire de conception l'autorise explicitement (« créer, modifier ou
  cocher une tâche », `cli_agent.rs:135-141`). Décision, pas défaut.
- **6 alertes `pnpm audit`** (sous `next>sharp`, `next>postcss`) : outils de
  construction, inatteignables dans l'app (export statique, images non
  optimisées). Disparaîtront avec la montée de Next.
- **Navigation vers les pièces jointes dans la fenêtre** (`src-tauri/src/navigation.rs:14-23`) :
  non vérifié qu'un tel document puisse appeler Tauri ; à investiguer
  seulement.
- **Coût d'affichage de l'Historique** : jamais mesuré ; à profiler avant
  d'agir.
- **Découper `db.rs`** : mécanique, source de conflits dans un fichier très
  modifié ; pas rentable maintenant.
- **Le dossier `sidecar/` (Python)** et la **dette de schéma sans interface** :
  décisions notées dans `docs/ROADMAP-PIVOT.md`.

## Non audité

Le dossier `motion/` (vidéos Remotion), le site au-delà de la liste des
accents, le code macOS en profondeur. Aucune mesure de performance réelle ;
les bugs ont été trouvés en lisant le code, pas en faisant tourner l'app ;
`cargo audit` n'était pas installé.
