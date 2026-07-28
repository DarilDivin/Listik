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

## PHASE P — Journal (remplace Notes)

**Objectif** : remplacer le module Notes (Phase C, `docs/ROADMAP.md`) par un Journal quotidien
personnalisable, avec mécanique de note écrite en avance pour une date future.

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

## PHASE Q — Accueil (Aujourd'hui + Routines + widget Journal)

**Dépend de P** (le widget a besoin que le Journal existe). La vue d'accueil reste
« Aujourd'hui » (déjà l'accueil actuel, `app/(app)/page.tsx:209`) — pas de refonte structurelle.

1. **Sous-section « Routines »** : regroupement **dérivé** dans `features/todos/grouping.ts`
   (`recurrence !== "none"` parmi les tâches déjà dans le seau `today`) — zéro nouvelle
   entité/table, cohérent avec le principe Phase E (état GTD dérivé, pas stocké). Rendu comme
   sous-section distincte, sur le même principe que « Ce soir ».
2. **Widget Journal** : composant affichant les blocs de la page du jour (via `useJournal`) +
   champ d'ajout rapide, intégré dans `app/(app)/page.tsx` (vue `today`), sans navigation. Un
   ajout ici crée une entrée `journal_entries` avec `target_day = written_at = aujourd'hui`.
3. **Design** : s'inscrit dans le langage existant (contenu à plat, hairlines, `--brand`) — pas
   de nouveau système visuel pour cette vue.

**Tester** : une tâche récurrente planifiée aujourd'hui apparaît dans « Routines », pas dans le
groupe « Aujourd'hui » générique ; le widget Journal affiche les blocs déjà écrits aujourd'hui et
permet d'en ajouter un sans quitter l'accueil.

**Fichiers clés** : `features/todos/grouping.ts`, `app/(app)/page.tsx`, `components/planner/`
(nouveau widget Journal).

---

## PHASE R — IA / CLI (remplace le sidecar agent, indépendant du reste)

**Objectif** : remplacer la génération de texte du sidecar (Groq via SDK `openai`, endpoints
`/ask`/`/agent`) par un agent CLI (abonnement Claude/Gemini) orchestré depuis Rust, outillé via
MCP sur les commandes existantes. **Indépendant** des phases O-Q, peut avancer en parallèle.

1. **Débranchement du RAG** : `sidecar/` (Python, `fastembed`, `sqlite-vec`, `/index`/`/search`/
   `/ask`/`/agent`) n'est plus spawné par l'app en production — retiré du `setup()` Tauri
   (`src-tauri/src/sidecar.rs`). Code et venv conservés dans le repo, lançable manuellement
   (`python sidecar/main.py`) pour continuer à l'étudier.
2. **Le `/parse` (correction Groq à la capture) migre en appel direct Rust → Groq** (`reqwest`,
   API OpenAI-compatible), sans passer par le sidecar Python — permet de ne **plus jamais**
   spawner de process Python en usage normal, tout en gardant Groq pour la capture instantanée.
   Décision technique qui résout concrètement « capture garde Groq » + « sidecar débranché ».
3. **Nouveau module Rust** (`src-tauri/src/cli_agent.rs` ou équivalent) : spawn du CLI choisi en
   mode non-interactif (`claude -p`, `gemini -p` ou équivalent), configuration MCP passée au
   process.
4. **Serveur MCP côté Rust** exposant les commandes existantes comme outils : lister/créer/
   modifier/supprimer tâches, lister/créer entrées de journal, recherche lexicale (réutilise
   `features/search/lexical.ts` côté outil si exposé, ou l'équivalent Rust). Le CLI-agent décide
   lui-même quels outils appeler et dans quel ordre — pas de recherche vectorielle.
5. **Abstraction provider** : interface Rust (trait) permettant plusieurs CLI interchangeables.
   Implémentations de départ : **Claude Code CLI** (seul confirmé installé,
   `claude.exe` v2.1.218) et **Gemini CLI/Antigravity**. Prévus mais différés : **OpenCode**,
   **Ollama local**.
6. **Réglage** (Settings) pour choisir le provider actif.
7. **Frontend** : nouvelle commande `ai_agent` (remplace l'appel `/agent` du sidecar) branchée
   sur le mode Question de l'Omnibar et la section Assistant — même façade utilisateur, moteur
   différent.

**Risques identifiés (assumés)** :
- Latence : chaque tour de l'Assistant implique un démarrage de process (1-3s+) et
  potentiellement plusieurs appels d'outils enchaînés — acceptable pour une conversation, pas
  pour la capture (raison du split avec Groq).
- Support MCP variable selon le CLI (solide chez Claude Code et Gemini CLI, incertain pour
  OpenCode/futurs providers) — architecture pensée pour tolérer un provider qui ne le supporte
  pas encore.
- Conditions d'utilisation des abonnements grand public pour un usage automatisé par une app
  tierce : zone grise, **risque assumé** par l'utilisateur, usage strictement personnel/local.

**Tester** : reprise des scénarios D2/D4 de `docs/ROADMAP.md` (« qu'est-ce que j'ai cette
semaine ? », « ajoute une tâche », « note : idée… ») mais via le CLI choisi plutôt que Groq ;
`/parse` à la capture continue de fonctionner sans que le sidecar Python soit lancé.

**Fichiers clés** : `src-tauri/src/sidecar.rs` (retrait du spawn), `src-tauri/src/cli_agent.rs`
(nouveau), `src-tauri/src/commands.rs`, `sidecar/` (conservé, non spawné).

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
4. **R** : Assistant répondant via CLI ; capture toujours instantanée via Groq ; sidecar Python
   non spawné en usage normal.
5. **S** : à définir à l'attaque de la phase.

**Principe directeur** (repris des chantiers précédents) : une phase n'est entamée qu'une fois la
précédente testée ; rien n'est supprimé par défaut, seulement débranché, sauf mention contraire ;
le sidecar Python reste dans le repo comme projet d'apprentissage, pas comme dette à éliminer.
