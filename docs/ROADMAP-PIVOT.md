# Listik → Pivot post-Things — Feuille de route

> Chantier suivant, décidé après la clôture complète du chantier ergonomie Things 3
> (`docs/ROADMAP-THINGS.md`, phases E→N). Issu d'une session `/grilling` (interview
> contradictoire complète, pas un simple brief) le 2026-07-25 — chaque décision ci-dessous a été
> critiquée et challengée avant d'être validée, pas simplement acceptée telle que demandée.

## Contexte

Après E→N, l'utilisateur s'est senti perdu dans la richesse fonctionnelle de l'app et a soumis 5
idées à challenger plutôt qu'à exécuter directement : une vue d'accueil Aujourd'hui+Routines, un
Journal façon Bear en remplacement des Notes, un remplacement du sidecar IA par les CLI
d'abonnement (Claude/Gemini/…), un audit de ce qui est incohérent/inutile, et une refonte
UI/UX. La session a vérifié les faits contre le code réel (pas la doc) avant de trancher.

### Décisions validées (résumé)

- **Ordre d'attaque** (dépendances) : **Nettoyage → Journal → Accueil → IA/CLI** (indépendant,
  en parallèle ou après) **→ Refonte UI/UX** (différée, portée volontairement limitée).
- **Notes (Phase C) disparaît**, remplacé par le Journal. Code gardé en référence, plus une
  section active du produit.
- **Le sidecar Python IA (RAG : `fastembed`+`sqlite-vec`, agent Groq)** est débranché de l'usage
  réel, **gardé dans le repo comme projet d'apprentissage** — l'utilisateur veut comprendre RAG/
  embeddings/agent, pas seulement les avoir en prod.
- **La capture (Alt+Q, Omnibar `/tache`) garde Groq**, non touchée — un CLI en sous-processus est
  trop lent pour un chemin pensé zéro-friction.
- **Le système de design actuel reste la base** (tokens, 6 accents, Noir pur, motion à ressort) —
  pas remis à plat, sort à peine d'être fini.
- **Rien n'est supprimé par défaut** : ce qui est retiré de l'UI/du runtime est débranché, pas
  effacé, sauf mention contraire explicite — cohérent avec le traitement déjà appliqué à
  `FilterTabs` en Phase F.

---

## PHASE O — Nettoyage (avant d'ajouter quoi que ce soit) ✅ FAITE

**Objectif** : alléger l'existant. Aucune de ces fonctionnalités n'a encore été éprouvée à
l'usage réel (l'app tourne peu au quotidien) ; certaines sont des pistes explorées jamais
tranchées, d'autres des incohérences documentées mais non corrigées.

1. **Simplifier les styles de section** (`components/ui-prefs.tsx`, `SECTION_STYLE_OPTIONS`/
   `DEFAULT_SECTION_STYLES`) : forcer **`"list"` partout**, retirer le réglage des Préférences
   (`SectionStyleSetting` ou équivalent). Les 5 autres styles (Horizon, Zoom sémantique,
   Stratigraphie, Loupe, Portail) restent dans le repo, débranchés — **candidat explicite** à une
   vraie refonte en Phase S, pas une suppression définitive (l'utilisateur aime l'idée, juge la
   réalisation actuelle « mal réalisée »).
2. **Unifier les deux mécanismes d'undo** (voir `docs/ROADMAP-THINGS.md` Phase K2) : suppression
   = commit différé 5s, toggle/update = contre-mutation rejouée via toast — deux systèmes
   indépendants qui peuvent coexister brièvement (« assumé, non corrigé » à l'origine). Objectif :
   un seul comportement prévisible, sans régresser le piège connu (`toggle()` sur une récurrente
   avance des champs, ne les annule pas via un second `toggle()`).
3. **Retirer les occurrences fantômes** de la vue À venir (`docs/ROADMAP-THINGS.md` Phase M,
   `buildGhostOccurrences`, `GhostRow`) : jugées overkill à l'usage réel. Retiré du rendu ;
   fichiers conservés, non appelés (même traitement que `FilterTabs`).

**Hors périmètre, décision explicite (pas un oubli)** : la dette de schéma sans UI (table
`headings`/`heading_id`, `tags.parent_id`, pont `isTriaged`/colonne `list`) n'est **pas touchée**
dans cette passe. Gardés inchangés : duplication tâche/projet, barre multi-sélection, tout le
reste du chantier Things.

**Tester** : les 9 sections du Planificateur rendent toutes en style Liste sans réglage visible ;
annuler une suppression ET annuler un toggle/update produisent chacun un seul comportement
cohérent ; la vue À venir n'affiche plus de lignes fantômes.

---

## PHASE P — Journal (remplace Notes) ✅ FAITE (cœur), éditeur v1 simplifié

**Objectif** : remplacer le module Notes (Phase C, `docs/ROADMAP.md`) par un Journal quotidien
personnalisable, avec mécanique de note écrite en avance pour une date future.

**Décision d'implémentation (2026-07-28)** : la « décision technique ouverte » du point 5
ci-dessous a été tranchée en différant le choix de lib WYSIWYG-markdown — l'éditeur v1 est un
simple `<textarea>` en auto-save au blur (même pattern que l'ancien `NoteEditor`), le rendu au
repos passe par `react-markdown` (déjà une dépendance). Raison : une page-jour est un FIL de N
blocs, monter un éditeur riche (Tiptap/ProseMirror) par bloc aurait été lourd pour un gain non
prouvé avant usage réel ; monter l'éditeur riche uniquement sur le bloc en focus reste possible
plus tard sans changer le modèle de données. Amélioration explicitement différée, pas oubliée —
prochaine étape naturelle si le besoin se confirme à l'usage.

1. **Libérer le nom** : l'ancienne vue Planificateur « Journal » (Terminées, Phase F/M) devient
   **« Historique »** dans le rail (`PlannerRail`, `SECTION_META`) — collision de nom avec le
   nouveau module, pas de changement de comportement sous-jacent.
2. **Backend** (migration additive, pattern notes) :
   - `journal_entries (id, target_day DATE, written_at TIMESTAMP, content TEXT, created_at,
     updated_at)`. Un « bloc horodaté » = une ligne. Une « page-jour » = toutes les lignes dont
     `target_day` = cette date, triées par `written_at`.
   - `journal_entry_tags (entry_id, tag_id)` — join M-N, réutilise la table `tags` existante
     (Phase H), même pattern que `task_tags`.
   - Modèle `src-tauri/src/models/journal_entry.rs` (dérive `TS`), commandes CRUD +
     `list_journal_entries_for_day`/`list_upcoming_journal_entries` + event `journal:changed`
     (pattern `notes:changed`).
3. **Frontend** : `features/journal/{types,api,useJournalMutations,useJournalSync}.ts`,
   `hooks/useJournal.ts`, clé SWR dédiée.
4. **Page** `app/(app)/journal/page.tsx` (remplace `app/(app)/notes/page.tsx`) : navigation par
   jour (page-jour = fil de blocs horodatés), section « À venir » listant les entrées dont
   `target_day > aujourd'hui` (visibles/modifiables avant leur jour cible), badge « écrit le
   [date] » sur un bloc dont `written_at` ≠ `target_day`.
5. **Éditeur** : formatage markdown **en direct dans un seul champ** (façon Bear — remplace le
   double panneau texte/aperçu de l'ancien `NoteEditor`). **Décision technique ouverte** : choix
   d'une lib WYSIWYG-markdown (ex. Tiptap/ProseMirror) — à trancher à l'implémentation, plus gros
   morceau frontend du chantier.
6. **Omnibar** : `/note` crée désormais un bloc de Journal pour **aujourd'hui** (pas de sélecteur
   de date depuis la capture rapide — le sélecteur de date future n'existe que dans l'éditeur
   complet du Journal, pas dans Alt+Q).
7. **Retrait de Notes** : section « Notes » retirée de la sidebar/omnibar (mode `/note`
   repointé, pas supprimé) ; fichiers `features/notes/`, `components/notes/`,
   `app/(app)/notes/` conservés en l'état, non référencés.

**Tester** : créer un bloc aujourd'hui, un bloc daté dans 5 jours (apparaît en « À venir »,
disparaît de là et apparaît sur sa page-jour à J+5 avec la mention du jour d'écriture) ; tag
posé sur un bloc retrouvable depuis un autre jour ; `/note idée` (Alt+Q) atterrit comme bloc du
jour.

**Fichiers clés** : `src-tauri/migrations/`, `src-tauri/src/models/journal_entry.rs`,
`src-tauri/src/db.rs`, `src-tauri/src/commands.rs`, `features/journal/`,
`app/(app)/journal/page.tsx`, `components/journal/` (nouveau, éditeur + fil de blocs).

---

## PHASE Q — Accueil (Aujourd'hui + Routines + widget Journal) ✅ FAITE

**Dépend de P** (le widget a besoin que le Journal existe). La vue d'accueil reste
« Aujourd'hui » (déjà l'accueil actuel, `app/(app)/page.tsx:209`) — pas de refonte structurelle.

1. **Sous-section « Routines »** : regroupement **dérivé** dans `features/todos/grouping.ts`
   (`recurrence !== "none"` parmi les tâches déjà dans le seau `today`) — zéro nouvelle
   entité/table, cohérent avec le principe Phase E (état GTD dérivé, pas stocké). Rendu comme
   sous-section distincte, sur le même principe que « Ce soir ». Tonalité `default` (pas
   `today`) pour éviter d'empiler un 3e halo d'accent dans la même colonne.
2. **Widget Journal** : composant affichant les blocs de la page du jour (via `useJournal`) +
   champ d'ajout rapide, intégré dans `app/(app)/page.tsx` (vue `today`), sans navigation. Un
   ajout ici crée une entrée `journal_entries` avec `target_day = written_at = aujourd'hui`.
   `useJournal` accepte un 2e argument `withUpcoming` (défaut `true`) — le widget passe `false`
   pour éviter un appel IPC « À venir » qu'il n'affiche jamais.
3. **Design** : s'inscrit dans le langage existant (contenu à plat, hairlines, `--brand`) — pas
   de nouveau système visuel pour cette vue. Confirmé : le widget réutilise `JournalEntryRow`/
   `JournalComposer` de la page complète, aucun nouveau renderer.

**Tester** : une tâche récurrente planifiée aujourd'hui apparaît dans « Routines », pas dans le
groupe « Aujourd'hui » générique ; le widget Journal affiche les blocs déjà écrits aujourd'hui et
permet d'en ajouter un sans quitter l'accueil. **Vérifié** : `tsc --noEmit`, 120 tests (dont 3
nouveaux tests Routines), lint, et vérification structurelle en navigateur (rendu du widget,
saisie dans le composer, navigation « Ouvrir » → `/journal`).

**Deux points de comportement à observer en usage réel** (fidèles au libellé de la spec
ci-dessus, pas des bugs d'implémentation — mais à surveiller) :
- Une routine manquée hier tombe dans « En retard » le lendemain (comme toute tâche planifiée en
  retard), pas dans « Routines » — la sous-section ne montre que les récurrentes planifiées
  *aujourd'hui*. À rediscuter si ça gêne à l'usage : faudrait-il que « Routines » absorbe aussi
  les récurrentes en retard ?
- Cocher une tâche de Routines saute la pause de 900 ms (`LINGER_MS`) qui existe pour les autres
  sections, car une récurrente reprogrammée quitte immédiatement le seau au lieu de rester
  affichée en `completed` un instant — comportement pré-existant pour toute tâche récurrente
  (pas introduit par cette phase), juste plus visible maintenant que Routines les regroupe.
- Pas d'ordre manuel dans Routines (`orderingContextOf` renvoie `null`, même choix que
  « Ce soir »/« En retard ») — décision assumée, commentée dans `features/todos/ordering.ts`.

**Fichiers clés** : `features/todos/grouping.ts`, `app/(app)/page.tsx`, `components/planner/
JournalWidget.tsx` (nouveau), `hooks/useJournal.ts`, `components/ui-prefs.tsx`,
`features/todos/ordering.ts`.

---

## PHASE R — IA / CLI (remplace le sidecar agent, indépendant du reste)

**Objectif** : remplacer la génération de texte du sidecar (Groq via SDK `openai`, endpoints
`/ask`/`/agent`) par un agent CLI (abonnement Claude/Gemini) orchestré depuis Rust, outillé via
MCP sur les commandes existantes. **Indépendant** des phases O-Q, peut avancer en parallèle.

### Décisions verrouillées (2026-08-09, session de revue)

La revue a tranché le sort des fonctionnalités « RAG » : elles sont **préservées**, mais
réparties sur les deux mécanismes dont elles dépendent vraiment :

1. **Assistant (conversation) → récupération « par l'agent »**, sans base vectorielle : Claude
   Code fait lui-même la recherche sémantique **dans son contexte**, en enquêtant (outils
   lister/filtrer + `search_entries` + lecture). La compétence « trouver par le sens » est
   portée par le LLM, pas par un embedding. Le `answer_question`/`create_note` du sidecar
   disparaît (outils journal à la place).
2. **Ctrl+K (Quick Find) → Classe embedding local en Rust (option C validée)** : on **garde
   la recherche sémantique** (« magasin » → « supermarché »), mais le calcul d'embedding passe
   de `fastembed`-Python à un module **Rust** (`fastembed-rs`/`ort`, même modèle
   `multilingual-MiniLM-L12-v2`, déjà présent sur la machine). Fin de `sqlite-vec` : cosinus
   brut (produit scalaire) sur une table SQLite — brute force, négligeable < 10 000 × 384.
   Aucun `python.exe`, aucune API.
3. **« Sources » de l'Assistant conservées** : reconstruites côté Rust à partir des **outils
   réellement appelés par le CLI pendant le tour** (id + texte des entrées touchées), remontées
   dans `AiAgentResponse` — la façade `assistant/page.tsx` reste intacte.

### Runbook (R0→R6, chacune livrable et testée seule)

- **R0 — Spike « spawn CLI + MCP »** : preuve que `claude -p` s'exécute bien en sous-processus
  depuis Rust (`tokio::process`), capture stdout/stderr + format JSON, chemin `--mcp-config`,
  comportement quand le CLI manque, durée de démarrage. Critère : `claude -p "bonjour"` répond
  dans un exemple Rust isolé et le process est tué à la fin (pas d'orphelin).
- **R1 — Débrancher Python du runtime** : retirer de `main.rs` `sidecar::spawn()`,
  `SidecarState`/`kill` et `vectorizer.rs` (`needs_embedding`/`pending_deindex` inertes). Le
  dossier `sidecar/` reste dans le repo, lançable manuellement (`python sidecar/main.py`)
  comme **labo pédagogique** (IA/RAG), jamais comme service aux runtime.
- **R2 — Capture directe Rust → Groq** : `ai_parse` devient un POST `reqwest` vers
  `https://api.groq.com/openai/v1/chat/completions` (API OpenAI-compatible, même modèle et
  prompt système), clé stockée dans Réglages (jamais en dur dans le repo). Timeout 8 s,
  fallback parsing local inchangé. Critère : Alt+Q crée une tâche **sans aucun `python.exe`
  actif** (`Get-CimInstance`).
- **R3 — Retriever sémantique Rust (Ctrl+K)** : `src-tauri/src/embeddings.rs` + migration
  (table `todo_embeddings`), embedding au moment de l'écriture (create/update) via
  `fastembed-rs` ; commande `semantic_search(query, k)` (même forme que l'ancienne `ai_search`
  → `SearchOverlay.tsx` **inchangée**, seul le fond change). Critère : Ctrl+K retrouve
  « magasin » → « supermarché », hors ligne, sans sidecar.
- **R4 — Serveur MCP + agent** : `src-tauri/src/cli_agent.rs` ; serveur MCP Rust (stdio,
  JSON-RPC, crate `rmcp` ; repli si dépendance non conforme) exposant `list_todos` (filtres
  date/statut/rattachement), `create_todo`, `update_todo`, `delete_todo`,
  `list_journal_entries_for_day`, `create_journal_entry`, `search_entries` (lexical, porté de
  `features/search/lexical.ts`). Chaque mutation → `db::*` + `notify_changed` (l'UI se
  rafraîchit comme un clic manuel). Nouvelle impl `ai_agent` : spawn `claude -p` + fichier
  temporaire `--mcp-config`, prompt système (règles d'usage, « jamais d'action au hasard » :
  réponse `not_found` si ambigu), relais du `history`, **collecte des outils appelés →
  `sources`**, désérialisation → `AiAgentResponse`.
- **R5 — Abstraction provider + Réglage** : trait `AgentProvider { kind, args de spawn,
  mcp-config, timeout }` ; implémentations `Claude` (défaut, `claude.exe` v2.1.218 confirmé) →
  `Gemini`/Antigravity. Réglage « Agent IA » (provider actif). Prévus plus tard : **OpenCode**,
  **Ollama local**.
- **R6 — Robustesse Windows** : timeout par tour (ex. 60 s) + bouton « Arrêter » côté UI
  (`assistant/page.tsx`) qui coupe l'arbre de process du CLI en cours (Job Object / taskkill
  /T — la leçon [[windows-process-cleanup]] : vérifier les orphelins `claude.exe`/`python.exe`
  avec `Get-CimInstance` avant relance) ; kill des agents en cours dans le `RunEvent::Exit`.

**Risques identifiés (assumés)** :
- Latence : chaque tour implique un démarrage de process (1-3 s+) et potentiellement plusieurs
  appels d'outils enchaînés — acceptable pour une conversation, pas pour la capture (raison du
  split Groq direct, R2).
- Support MCP variable selon le CLI (solide chez Claude Code et Gemini CLI, incertain pour
  OpenCode/futurs) — design tolère un provider qui ne parle pas MCP (chat simple).
- Conditions d'utilisation des abonnements grand public pour un usage automatisé par une app
  tierce : zone grise, **risque assumé** par l'utilisateur, usage strictement personnel/local.
- Recherche « par l'agent » dégradée sur les très gros contextes : atténuée par `search_entries`
  lexicale d'abord, puis lecture ciblée.

**Tester (acceptation)** : rejouer D2/D4 de `docs/ROADMAP.md` avec Claude (« qu'est-ce que j'ai
cette semaine ? », « ajoute une tâche », « note : idée… », « supprime la tâche des impôts »)
avec sources affichées ; Alt+Q continue de créer sans sidecar Python actif ; Ctrl+K retrouve
« magasin » → la tâche « supermarché » hors ligne.

**Fichiers clés** : `src-tauri/src/cli_agent.rs` (nouveau), `src-tauri/src/embeddings.rs`
(nouveau), migration `todo_embeddings`, `src-tauri/src/main.rs` (retrait du spawn sidecar),
`src-tauri/src/commands.rs` (`ai_parse` Groq direct, `ai_agent` CLI+MCP, `semantic_search`),
`sidecar/` (conservé, non spawné, labo pédagogique), Réglages → « Agent IA ».

---

## PHASE S — Refonte UI/UX (différée, portée limitée)

**But** : ne pas redessiner un système de design qui vient d'être fini (Phase N,
2026-07-24) — étendre le langage existant aux nouvelles surfaces et reprendre proprement ce qui
a été bâclé.

1. **Nouvelles surfaces** : accueil composite (Aujourd'hui + Routines + widget Journal) et
   Journal (page-jour, éditeur live, section À venir) — conçues dans le langage existant (tokens,
   accents, motion à ressort, contenu à plat), pas un nouveau système.
2. **Styles de section** (débranchés en Phase O) : **candidat explicite** à une vraie refonte —
   l'utilisateur aime l'idée, juge la réalisation actuelle « mal réalisée ». À reprendre avec une
   intention claire par section plutôt que 6 pistes génériques proposées partout.
3. **Polish** : aspérités trouvées en cours de route sur O-R (états vides, cohérence copy FR,
   accessibilité des nouveaux contrôles) — même esprit que la Phase N3 (audit ciblé, pas
   exhaustif).

**Tester** : à définir au moment d'attaquer la phase — dépend de ce qui reste à polir une fois
O-R livrées.

---

## Vérification globale (end-to-end)

1. **O** : styles de section verrouillés sur Liste ; un seul comportement d'undo ; plus de
   fantômes dans À venir.
2. **P** : Journal complet (jour, blocs horodatés, entrée future visible en « À venir », tags,
   `/note`) ; Notes retiré de la navigation.
3. **Q** : Routines séparées dans Aujourd'hui ; widget Journal fonctionnel sur l'accueil.
4. **R** : Assistant répondant via CLI (sources affichées, issues des outils appelés) ; capture
   toujours instantanée via Groq direct (aucun `python.exe` actif) ; Ctrl+K sémantique local Rust
   (embeddings) sans sidecar.
5. **S** : à définir à l'attaque de la phase.

**Principe directeur** (repris des chantiers précédents) : une phase n'est entamée qu'une fois la
précédente testée ; rien n'est supprimé par défaut, seulement débranché, sauf mention contraire ;
le sidecar Python reste dans le repo comme projet d'apprentissage, pas comme dette à éliminer.
