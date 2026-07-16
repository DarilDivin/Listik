# Listik → Assistant personnel intelligent — Feuille de route

> **Évolution ergonomie Things 3** (Domaines/Projets, Inbox, tags, dates avancées,
> réordonnancement, undo, etc.) → voir [`ROADMAP-THINGS.md`](./ROADMAP-THINGS.md).

## Contexte

Listik est un gestionnaire de tâches Tauri (UI Next.js/React + backend Rust/sqlx/SQLite). Objectif :
le faire évoluer vers un **assistant personnel intelligent**, en s'en servant comme support
d'apprentissage des 4 compétences clés IA/Data (NLP/LLM → RAG → pipeline de données → agent/function-calling).

**Réorientation produit** :
1. La barre `SmartTaskInput` devient une **Omnibar** — point d'entrée unique à *modes*, piloté par des
   **commandes à préfixe** (`/tache`, `/note`, …), avec un mode « question » qui deviendra la façade de l'agent IA.
2. L'app passe d'une *fenêtre Tauri par fonctionnalité* à **une seule fenêtre applicative multi-pages**
   (un *app shell* avec **barre latérale**). La fenêtre `planner` devient la fenêtre principale « Listik »
   et héberge les sections **Planificateur, Notes, Réglages, Assistant**. Seule la **capture rapide Alt+Q
   reste une fenêtre flottante séparée** (overlay global invocable de partout).
3. Nouveau **module Notes** autonome (façon Notes iPhone), comme **page** du shell.

Contrainte : le code IA est écrit **en Python** (compétence entreprise). Les concepts IA sont **agnostiques
au langage** — les apprendre ici = les savoir partout.

### Décisions validées
- **App shell** : fenêtre unique + **sidebar gauche**. Sections : Planificateur (accueil par défaut), Notes,
  Réglages, Assistant (place réservée, contenu en Phase D). Capture rapide Alt+Q = fenêtre flottante à part.
- **Omnibar — mode par défaut** : *configurable par surface* (prop `defaultMode`). Fenêtre Alt+Q = **Tâche**
  (capture instantanée préservée) ; section Assistant = **Question**. Préfixes `/tache`,`/note`,`/question` partout.
- **Module Notes** : entité autonome (≠ champ `note` d'une tâche). Éditeur **Markdown**. MVP = **épingler** + **recherche**.
- **IA — LLM** : *hybride*. API gratuite open-source — **Groq** (Llama 3.3 70B, compatible OpenAI) ou **Mistral** ;
  **Ollama** local en bonus final.
- **IA — Embeddings** : **locaux en Python** via `fastembed` ; stockage **`sqlite-vec`** (remplace `sqlite-vss`).
- **IA — Architecture** : **sidecar Python** (FastAPI) = cerveau IA. Rust reste chef d'orchestre et **propriétaire
  de SQLite** ; le sidecar a sa propre base vectorielle (`listik_vec.db`).

### Architecture cible
```
  Fenêtre principale « Listik » (app shell)        Fenêtre flottante (Alt+Q)
  ┌───────────┬───────────────────────────┐        ┌───────────────────────┐
  │ Sidebar   │  Omnibar (en haut)        │        │  Omnibar (Spotlight)  │
  │ Planif.   │  ──────────────────────   │        │  defaultMode="task"   │
  │ Notes     │  page active (section)    │        └───────────┬───────────┘
  │ Réglages  │                           │                    │ invoke
  │ Assistant │                           │                    ▼
  └─────┬─────┴───────────────┬───────────┘        Rust (Tauri) — owns SQLite
        │ invoke              │ invoke (ai_*)        todos + notes (CRUD, events)
        ▼                     ▼                      tâche de fond (modèle reminders.rs)
   Rust (Tauri)  ───────HTTP──────►  Sidecar Python (FastAPI)
                                     LLM (Groq) + embeddings (fastembed) + RAG + agent + sqlite-vec
```

### Vue d'ensemble — phases (chacune livrable et testée seule)
- **A — Omnibar + commandes** (produit, zéro IA)
- **B — App shell unifié** (fenêtre unique + sidebar, consolidation des fenêtres)
- **C — Module Notes** (page du shell)
- **D — IA** : D0 sidecar → D1 NLP → D2 RAG → D3 pipeline → D4 agent (mode Question + section Assistant) → D5 local

---

## PHASE A — Omnibar + système de commandes (zéro IA)

**Objectif** : transformer `SmartTaskInput` en `Omnibar` à modes, avec un registre de commandes extensible.
**Concepts** : command palette, design extensible, machine à états UI.

1. **Renommage** sans changement de comportement : `components/SmartTaskInput.tsx` → `components/Omnibar.tsx` ;
   `components/smart-input/` → `components/omnibar/` (`AutoGrowTextarea`, `PrioritySelect`, `HighlightedOverlay`).
   MAJ des 2 imports (`app/quick/page.tsx`, `app/planner/page.tsx`). **Consolider** le type `SmartTaskData`
   dupliqué (`features/todos/useSmartTaskInput.ts` + `hooks/usePlannerTodos.ts`).
2. **Registre de commandes** déclaratif `features/omnibar/commands.ts` :
   `OmnibarCommand { id, trigger, label, badge, placeholder, mode }`. Modes : `task`, `note`, `ask`.
   Ajouter une commande = ajouter une entrée. Prop `defaultMode` sur `<Omnibar>`.
3. **Hook `features/omnibar/useOmnibar.ts`** : détecte un préfixe `/xxx ` en tête → active le mode, retire le
   préfixe, expose le badge. Réutilise la navigation clavier de `useListAutocomplete`.
4. **Menu slash** : taper `/` déroule les commandes (popover, pattern `useListAutocomplete`).
5. **Câblage** : mode `task` = logique actuelle (`useSmartTaskInput` → `create_todo`). `note` et `ask` =
   **stubs** désactivés jusqu'aux phases C et D.

**Tester** : `/tache acheter du lait demain urgent #courses // bio` crée la tâche ; `/` affiche le menu ;
le badge de mode s'affiche ; `defaultMode="task"` → saisie nue = tâche.

---

## PHASE B — App shell unifié (fenêtre unique + barre latérale)

**Objectif** : une seule fenêtre applicative avec sidebar ; consolider les fenêtres Tauri.
**Concepts** : architecture d'app shell, routing client, layout partagé.

1. **Layout partagé** : groupe de routes `app/(app)/layout.tsx` rendant `components/AppSidebar.tsx`
   (liens : Planificateur, Notes, Réglages, Assistant + icônes) à gauche + zone de contenu à droite.
2. **Sections** : déplacer les pages existantes dans le groupe → `app/(app)/planner`, `app/(app)/settings` ;
   créer `app/(app)/notes` (Phase C) et `app/(app)/assistant` (**placeholder** « bientôt », Phase D4).
   `/` redirige vers Planificateur (accueil). `app/quick/page.tsx` **reste hors du groupe** (layout minimal
   transparent ; `app/layout.tsx` conserve sa détection `/quick`).
3. **Consolidation des fenêtres Tauri** (`src-tauri/tauri.conf.json`) : **une** fenêtre principale (réutiliser
   le label `main`), visible au lancement, ~1200×800, titre « Listik », url `/`. **Supprimer** la fenêtre
   `planner` séparée. **Conserver** la fenêtre `quick`.
4. **Commandes & tray** (`src-tauri/src/commands.rs`, `src-tauri/src/main.rs`) : `open_planner_window`/
   `show_main_window` → affichent/focus l'unique fenêtre principale ; navigation vers une section via un
   événement `navigate` émis au webview (le shell écoute et route) — utilisé par le tray et par les commandes
   omnibar `/planner`, `/notes`, etc. Adapter le menu du tray et `generate_handler!`.

**Tester** : l'app ouvre une fenêtre unique ; la sidebar bascule entre Planificateur/Réglages (Notes/Assistant
en placeholder) ; le tray et `/notes` naviguent dans la même fenêtre ; Alt+Q ouvre toujours la capture flottante.

---

## PHASE C — Module Notes (page du shell, zéro IA)

**Objectif** : entité Notes autonome (Markdown), comme section du shell, branchée à l'omnibar via `/note`.
**Concepts** : modélisation d'entité full-stack, CRUD, sync événementielle.

1. **Backend** (reproduit le pattern todo) :
   - Migration `src-tauri/migrations/0006_notes.sql` : `notes (id, title, content, pinned, created_at, updated_at)` + index.
   - Modèle `src-tauri/src/models/note.rs` (`Note`, `CreateNote`, `UpdateNote`, dérive `TS`) ; export `models/mod.rs`.
   - `src-tauri/src/db.rs` : `list_notes` (épinglées d'abord), `create_note`, `update_note`, `delete_note`,
     `search_notes` (MVP `LIKE` sur title+content ; FTS5 en évolution).
   - `src-tauri/src/commands.rs` : CRUD + `search_notes` + event `notes:changed` (calqué sur `notify_changed`).
     Enregistrer dans `generate_handler!` (`src-tauri/src/main.rs`). **Pas de fenêtre dédiée.**
2. **Frontend** (pattern todos) : `features/notes/{types.ts, api.ts, useNotesMutations.ts, useNotesSync.ts}`,
   `hooks/useNotes.ts`, clé `SWR_KEYS.ALL_NOTES` (`lib/swr-config.ts`).
3. **Page** `app/(app)/notes/page.tsx` : liste maître-détail (épinglées en haut) + éditeur **Markdown**
   (`react-markdown` + `remark-gfm` ; textarea + aperçu, autosave *debounced* → `update_note`), bouton épingler,
   champ recherche.
4. **Omnibar** : mode `note` (`/note`) → `create_note` (depuis la fenêtre quick : créer puis fermer).

**Tester** : section Notes — créer/éditer/épingler/rechercher ; `/note idées cadeau` crée une note ; sync via `notes:changed`.

---

## PHASE D — Mode Question + IA

> Chaque sous-étape est livrable et testée *isolément* (curl le sidecar) **avant** intégration.

### D0 — Fondation : sidecar Python
**Concepts** : microservice, IPC, packaging desktop.
Projet `sidecar/` (FastAPI + uvicorn, `GET /health`, port en argument). Rust : module `src-tauri/src/sidecar.rs`
qui **spawn** le sidecar au `setup()` (dev : `python main.py` ; prod : binaire PyInstaller via `externalBin`),
**healthcheck** (`reqwest`), **kill à l'exit** (`RunEvent::Exit`). Commande `ai_ping()`. Ajouter `reqwest` à `Cargo.toml`.
**Tester** : `curl /health` OK + ping UI.

### D1 — NLP : extraction LLM (hybride, branchée au mode Tâche)
**Concepts** : appel LLM, prompt engineering, **structured/JSON outputs**, few-shot.
Sidecar `POST /parse {text}` → Groq/Mistral via SDK `openai` (base_url configurable) → JSON validé Pydantic au
format `SmartTaskData`. Le mode Tâche garde le regex (surlignage instantané) et appelle `/parse` (`ai_parse`) à
la validation pour corriger négation/contexte.
**Tester** : `/parse {"text":"appeler maman demain, pas urgent #famille // anniv"}` → `priority:"normal"`.

### D2 — RAG : embeddings + recherche sémantique (tâches ET notes)
**Concepts** : embeddings, similarité cosinus, base vectorielle, RAG.
`fastembed` (`intfloat/multilingual-e5-small`, 384 dims) + `sqlite-vec` (`listik_vec.db`). Endpoints
`POST /index {id,type,text}`, `POST /search {query,k}`, `POST /ask {question}` (retrieve → prompt → réponse).
**Indexe les deux sources** : tâches *et* notes.
**Tester** : `/search` sémantique + `/ask` citant tâches/notes.

### D3 — Data Engineering : pipeline d'indexation asynchrone
**Concepts** : pipeline async, idempotence, sync incrémentale.
Colonne `needs_embedding` (todos + notes, migration `0007_*`) mise à `1` à chaque mutation. Tâche de fond
`src-tauri/src/vectorizer.rs` **calquée sur `reminders.rs`** (tick ~5 s) : batch → `/index`, flag → `0` ;
suppression via `/deindex` ; retry si sidecar pas prêt.
**Tester** : créer/modifier/supprimer une tâche ou note se reflète dans `listik_vec.db`, UI fluide.

### D4 — Agent : function calling + mode Question + section Assistant
**Concepts** : function calling / tool use, classification d'intention, boucle agentique.
Sidecar `POST /agent {text}` déclarant des outils : `create_task`, `create_note`, `search`, `answer_question`,
`update_task`, `delete_task`. Les outils de données **rappellent les commandes Rust existantes** — l'agent ne
ré-implémente rien. La **section Assistant** (`defaultMode="ask"`) et le mode Question de l'omnibar routent vers
`/agent` ; la fenêtre quick s'agrandit pour afficher la réponse (redimensionnement dynamique déjà présent).
**Tester** : « ajoute appeler le dentiste vendredi » → `create_task` ; « qu'est-ce que j'ai cette semaine ? »
→ `answer_question` ; « note : idée d'article sur le RAG » → `create_note`.

### D5 (bonus) — Localiser le LLM (Ollama)
Ollama compatible OpenAI → rendre `base_url`/`model` configurables → app entièrement offline.

---

## Pile technique à ajouter
- **Frontend** : `react-markdown` + `remark-gfm` (notes). Réutilise SWR, Radix, Framer Motion.
- **Python (`sidecar/requirements.txt`)** : `fastapi`, `uvicorn`, `openai`, `pydantic`, `fastembed`, `sqlite-vec` ; prod `pyinstaller`.
- **Rust (`Cargo.toml`)** : `reqwest`, `tauri-plugin-shell` (spawn sidecar prod). tokio/sqlx déjà présents.
- **Secrets** : clé API LLM côté sidecar/env, jamais dans le webview.

---

## Vérification globale (end-to-end)
1. **A** : `/tache` crée une tâche ; menu slash ; badge de mode.
2. **B** : fenêtre unique + sidebar ; sections naviguent dans la même fenêtre ; Alt+Q reste flottant.
3. **C** : Notes complet (créer/éditer/épingler/rechercher) ; `/note` ; sync multi-vues.
4. **D0** : `curl /health` + ping UI.
5. **D1** : `/parse` corrige une négation.
6. **D2** : `/search` + `/ask` sur tâches **et** notes.
7. **D3** : indexation auto en arrière-plan, UI fluide.
8. **D4** : mode Question → bonne action ; réponse affichée dans l'omnibar / section Assistant.
9. **D5** : bascule Groq → Ollama, offline.

**Principe directeur** : une phase n'est entamée qu'une fois la précédente testée ; le sidecar est toujours
testé isolément (curl) avant intégration — on ne mélange jamais deux sources de bugs.
