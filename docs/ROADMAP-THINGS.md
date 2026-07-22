# Listik → Ergonomie Things 3 — Plan complet

> Chantier d'évolution vers la puissance structurelle de Things 3, adaptée à l'identité de
> Listik. Complément de `ROADMAP.md` (qui couvre Omnibar/Notes/IA, phases A→D). Référence
> versionnée du chantier ; les phases sont livrées et testées une à une.

## Contexte

Listik est un gestionnaire de tâches (Tauri, UI Next.js/React, backend Rust/sqlx/SQLite,
sidecar Python pour l'IA). Il a déjà : capture rapide Alt+Q, parsing naturel (dates,
priorité, `#liste`, note), sections temporelles animées, récurrences simples, rappels,
journal des terminées, recherche sémantique, assistant IA, undo sur suppression.

L'objectif est d'**adapter l'ensemble des fonctionnalités de Things 3** (structure
Domaines → Projets → Tâches, Inbox GTD, tags, deadline distincte de la planification,
récurrences avancées, Ce soir, vue À venir, réordonnancement manuel, multi-sélection,
navigation clavier, undo, duplication, Quick Find) **sans trahir le design existant** :
contenu plat sur le canvas, accent `--brand` unique choisi par l'utilisateur, thèmes
clair/sombre, motion à ressort. On garde l'ergonomie de Things pour ne pas se perdre.

**Résultat visé** : une app à la puissance structurelle de Things, mais avec l'identité
visuelle de Listik et son IA — le tout livré en phases indépendamment testables, comme le
reste du projet.

### Décisions utilisateur (validées)
- **Navigation GTD** : rail secondaire **à l'intérieur** de la section Planificateur
  (le shell à 4 sections et le choix dock/sidebar restent intacts).
- **Undo** : **par toast, à un pas** (chaque action réversible offre « Annuler »). Pas de
  pile d'historique globale.
- **Migration** : chaque `list` plate distincte → un **Projet** (dual-write réversible) ;
  la section « Terminées » devient le **Journal** accessible depuis le rail.
- **Périmètre** : **version lean d'abord** — en-têtes de projet (Headings) et tags
  imbriqués reportés à une passe ultérieure ; colonnes `parent_id`/`heading_id` présentes
  mais sans UI. Projets + tags plats + sous-tâches d'abord.

### Hors périmètre (assumé)
Intégration calendrier système, affichage d'événements dans Aujourd'hui/À venir, autofill
de contexte à la capture, import Rappels Apple, « Mail to Things », widgets OS, sync
multi-appareils, apps mobile/watch, multi-fenêtrage de projets.

### Boussole ergonomique — familiarité Things, sans dénaturer Listik

Fil rouge de TOUTES les phases (prime sur les détails d'implémentation) :

- **Reprendre ce qui fait aimer Things** : minimalisme, calme visuel, un geste = une action
  évidente, hiérarchie claire, zéro friction à la capture. On importe ces *qualités*, pas
  forcément les pixels.
- **Un habitué de Things ne doit jamais être perdu** — ni **visuellement** (mêmes repères :
  rail de gauche avec Boîte de réception / Aujourd'hui / À venir / Un jour / Journal, coche à
  gauche, détail au clic, deadline distincte, anneau de progression du projet), ni
  **fonctionnellement** (mêmes gestes : glisser pour réordonner/planifier, `#tag`, planifier
  au clavier, Ce soir…). Les *conventions et emplacements* de Things sont la référence par
  défaut quand un doute se présente.
- **Sans dénaturer Listik** : on garde l'identité maison — contenu plat sur le canvas, accent
  `--brand` unique et personnalisable, thèmes, motion à ressort, IA/omnibar. Le design system
  (`docs/DESIGN-SYSTEM.md`) est un **guide, pas un carcan** : on suit ses principes (pas de
  carte élevée pour le contenu, couleur vive via `--brand`, vocabulaire de motion), mais on
  s'autorise à emprunter à Things un repère qui aide l'utilisateur même s'il n'est pas déjà
  codifié — à condition de le fondre dans les tokens et le langage visuel de Listik.
- **Arbitrage** en cas de conflit : d'abord *ne pas perdre l'utilisateur*, puis *rester fidèle
  à l'identité Listik*, puis *la lettre du design system*.

---

### Stratégie d'icônes (décidée)

Étude menée : `lucide-react` est déjà la famille d'icônes de contenu (35 fichiers, dont **tous**
les primitifs shadcn — `ui/sidebar`, `sheet`, `select`, `dropdown-menu`, `dialog`,
`context-menu`, `command`, `checkbox`, `calendar`, `spinner`) ; `@fluentui/react-icons` reste
réservé au chrome fenêtre (`TitleBar`, verrouillé). Décision : **rester sur Lucide, famille
unique.**

- **Pourquoi pas Phosphor/autres** : mélanger deux familles = deux grammaires visuelles
  (grille, trait) → désoriente subtilement, à l'opposé de l'objectif « ne pas perdre
  l'utilisateur ». Une migration totale vers Phosphor (pour ses poids/fill) obligerait aussi à
  remplacer les icônes des primitifs shadcn — coût élevé pour un gain d'expressivité qu'on peut
  obtenir autrement.
- **État actif « plein » façon Things** : au lieu d'un second jeu, utiliser `fill` (ou un
  glyphe plein apparié) sur l'icône Lucide active (rail, nav, coche).
- **Animation, sans lib Lottie** : animer à la main une poignée d'icônes-signature avec
  `lib/motion.ts` (tracé de la coche déjà custom, cloche du rappel, rotation du « répéter »,
  entrée du rail). Léger, teintable via `currentColor`/`--brand`, fidèle à « motion = ressort ».
  Pas de Lordicon/useAnimations (poids de bundle, teinte `--brand` difficile). → mis en œuvre au
  fil des phases concernées et consolidé en **Phase N**.

---

## Invariants transverses (à respecter à CHAQUE phase)

Ces règles sont la condition pour que chaque phase reste cohérente avec l'existant. Elles
ne sont pas répétées dans chaque phase — elles s'appliquent partout.

1. **Événement de synchro** : toute nouvelle mutation Rust émet `todos:changed` (ou un
   `projects:changed`/`tags:changed` calqué sur `notify_changed`, `src-tauri/src/commands.rs`).
2. **Indexation IA** : tout texte visible par l'utilisateur (nom de projet, de domaine, de
   tag) doit alimenter le constructeur de texte d'embedding (`db::todos_needing_embedding`,
   `src-tauri/src/db.rs`) et repositionner `needs_embedding = 1` à la mutation.
3. **Types générés** : après tout changement de struct Rust, régénérer les types ts-rs vers
   `features/todos/generated/` (et créer les dossiers `generated/` équivalents pour projets/tags).
4. **Boucles de fond** : tout changement de sémantique sur `scheduled_for`/`due_date` (phases
   I et J) impose de revérifier `src-tauri/src/reminders.rs` (rappels + digest quotidien) et
   `Recurrence::advance` (`src-tauri/src/models/task.rs`).
5. **Design system, en guide** (`docs/DESIGN-SYSTEM.md`) : suivre ses **principes** — contenu
   plat sur `--background` groupé par hairlines (`border-t`/`divide-y border-border/60`, pas de
   carte élevée ni de `.card-soft`), couleur vive via `--brand`/`--brand-soft`, motion de
   `lib/motion.ts` (pastilles à `layoutId` unique, `AnimatedNumber`), Radix via le paquet
   unifié `radix-ui`, jamais de contrôle d'édition monté dans `TodoItem` (édition via le
   `Sheet`). Mais c'est un **guide, pas un carcan** (voir Boussole) : on peut emprunter à
   Things un repère utile absent du système, du moment qu'on le rend avec les tokens Listik.
6. **Nouvelle surface** : s'inspirer de la checklist `docs/DESIGN-SYSTEM.md:284-294` et des
   conventions Things, en gardant l'utilisateur orienté plutôt qu'en appliquant une règle à la
   lettre.

---

## Phase 0 — Persister ce plan dans le repo ✅

Fait : ce plan est copié dans `docs/ROADMAP-THINGS.md` (ce fichier), aux côtés de
`docs/ROADMAP.md` et `docs/DESIGN-SYSTEM.md`, avec un pointeur depuis `docs/ROADMAP.md`.

---

## Phase E — Fondation relationnelle (backend, schéma complet)

**But** : poser en une seule passe tout le schéma dont les phases suivantes ont besoin, sans
changer un pixel de l'UI actuelle. C'est la fondation ; tout le reste en dépend.

**Concepts** : modélisation relationnelle, migration additive idempotente, dual-write.

1. **Migrations** (`src-tauri/migrations/0009_*` … `0011_*`, additives via `sqlx::migrate!`) :
   - `areas (id, name, position, created_at)`.
   - `projects (id, name, note, area_id?, status[active/completed], deadline?, position, created_at, updated_at)`.
   - `tags (id, name, parent_id?, created_at)` — `parent_id` présent, sans UI d'imbrication (lean).
   - `task_tags (todo_id, tag_id)` join M-N + index.
   - `orderings (context TEXT, todo_id TEXT, position INTEGER, PRIMARY KEY(context, todo_id))` —
     **ordre manuel par contexte** (`today`, `anytime`, `someday`, `inbox`, `project:<id>`).
     C'est le point d'architecture clé (voir risque n°1 ci-dessous) : un seul `position` global
     ne peut pas reproduire Things, où l'ordre dans un projet ≠ l'ordre dans Aujourd'hui.
   - `ALTER todos ADD` : `project_id?`, `heading_id?` (présent, sans UI), `this_evening INTEGER DEFAULT 0`,
     `someday INTEGER DEFAULT 0`. Étendre `SELECT_COLUMNS` (`src-tauri/src/db.rs:15`).
   - `headings (id, project_id, name, position, created_at)` : table créée, **sans UI** (lean).
2. **État GTD dérivé + override** (pas un enum figé qui se battrait avec `scheduled_for`) :
   on ne stocke que le non-dérivable — `someday` (booléen). Le reste se **déduit** dans
   `features/todos/grouping.ts` (fonction pure, mur porteur de l'animation) :
   - *Inbox* = pas de projet, pas de date, non someday, non planifié.
   - *Aujourd'hui* = `scheduled_for <= today` (+ sous-groupe *Ce soir* si `this_evening`).
   - *Quand je peux (Anytime)* = triée (a un projet ou a quitté l'inbox), sans date, non someday.
   - *Un jour (Someday)* = `someday = 1`.
3. **Migration des données — REPORTÉE en G** (revue fable) : pas de backfill SQL figé en E. Un
   `project_id` rempli par migration deviendrait périmé dès la 1re édition (create écrit `list`
   sans projet, un renommage de liste désynchronise), et le SQL diffusé est verrouillé par
   checksum. La réconciliation `list → projets` se fera en **G**, en Rust, sur données vivantes
   (testable, corrigible en patch). En E, `project_id` reste NULL partout. E laisse donc l'UI
   **identique au bit près** — `usePlannerTodos` dérive toujours la sidebar « listes » en scannant
   `list` (`hooks/usePlannerTodos.ts:74`), intact. Seule édition frontend forcée : ajouter les 4
   nouveaux champs au littéral `Todo` optimiste (`useTodoMutations.ts`).
4. **Modèles + commandes** : `src-tauri/src/models/{area,project,tag,heading}.rs` (dérive `TS`),
   export dans `models/mod.rs`. Commandes CRUD calquées sur les todos/notes
   (`src-tauri/src/commands.rs`), enregistrées dans `generate_handler!` (`src-tauri/src/main.rs`).

**Tester** : migrations passent sur une base existante ; `list_projects` renvoie un projet par
liste ; l'UI actuelle est inchangée ; ts-rs régénère sans erreur.

**Fichiers clés** : `src-tauri/migrations/`, `src-tauri/src/db.rs`, `src-tauri/src/models/`,
`src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `features/todos/generated/`.

---

## Phase F — Vues GTD canoniques + rail du Planificateur

**But** : le cœur ergonomique de Things — un rail de vues à l'intérieur du Planificateur.
Dépend uniquement de E (l'arbre Domaines/Projets vient en G).

1. **Rail** : composant `components/planner/PlannerRail.tsx` — colonne étroite, plate sur le
   canvas, séparée par une hairline, repliable, pastille active `--brand-soft` glissante
   (`layoutId="rail-active"`, motif §Design). Vues : Boîte de réception, Aujourd'hui, À venir,
   Quand je peux, Un jour, Journal. Compteurs `font-mono tabular-nums` via `AnimatedNumber`.
   Fonctionne identiquement sous dock ET sidebar (c'est pourquoi il vit dans le Planificateur,
   pas dans le shell — voir risque n°4).
2. **Routage de vue** : état de vue courante (`view`) dans la page Planificateur
   (`app/(app)/page.tsx`) ; chaque vue réutilise `groupTodosByDate` étendu (§E.2). *Aujourd'hui*
   affiche la sous-section **Ce soir** en bas. *Journal* remplace la section « Terminées »
   (Logbook, groupé par date de complétion, style `strata` déjà dispo).
3. **Inbox** : capture par défaut de l'Omnibar quand aucune date/projet n'est donné → tombe en
   Inbox ; le geste « planifier » ou « affecter à un projet » l'en sort.
4. **Prefs** : ajouter les nouvelles `SectionKey`/vues à `components/ui-prefs.tsx` (styles de
   section par vue) et `SECTION_STYLE_OPTIONS`.

**Tester** : basculer entre les 6 vues ; une tâche sans date apparaît en Inbox puis en sort une
fois planifiée ; Ce soir se remplit ; le Journal liste les terminées par date.

**Fichiers clés** : `app/(app)/page.tsx`, `features/todos/grouping.ts`,
`components/planner/` (nouveau `PlannerRail.tsx`), `components/ui-prefs.tsx`.

---

## Phase G — Projets & Domaines

> **Scindée en G1 (données) / G2 (UI)** : la version initiale empaquetait une migration, une
> couche de données, un arbre, deux types de vues et une bascule d'écriture — trois phases de
> surface, où la justesse de la migration se relisait au milieu du style des menus.

### G1 — Bascule des données ✅ FAITE

1. **Correctif de schéma** (migration `0011_todo_area.sql`) : `todos.area_id`. Sans lui, une
   tâche ne pouvait pas être rangée directement dans un Domaine (comportement Things de base)
   et la vue domaine de G2 aurait été impossible sans retrofit d'`isTriaged`, du détail et de
   l'omnibar. `delete_area` détache désormais aussi les tâches directes.
2. **Réconciliation** `db::reconcile_lists_into_projects` : un projet par `list` distincte,
   rapprochement **insensible à la casse** (« Travail »/« travail »/espaces → un seul projet ;
   piège : `DISTINCT`/`=` sont en BINARY par défaut), réutilise un projet existant de même nom,
   en transaction. **Idempotente** et rejouée à **chaque démarrage** (`main.rs` setup) : rattrape
   les tâches créées entre-temps par une version antérieure du binaire. Un échec n'empêche pas
   le démarrage.
3. **Couche données** : `features/projects/{types,api,useProjectsSync,useProjectsMutations}.ts`,
   `hooks/useProjects.ts`, clés `ALL_PROJECTS`/`ALL_AREAS` (préfixe `projects` → une seule règle
   de revalidation sur `projects:changed`).
4. **Fin de l'écriture de `list`** : `ProjectControl` remplace `ListControl` dans le détail (et
   purge la `list` héritée), le `#nom` de l'omnibar **et de la capture Alt+Q** résout vers un
   projet (get-or-create NOCASE), `ListFilter` filtre par `project_id`, `TodoMetaLine` affiche le
   nom du projet, l'autocomplétion vient de `list_projects`.
5. **Le pont `isTriaged` RESTE** (`project_id || area_id || list`) : inerte quand la
   réconciliation réussit, il est la différence entre « un bug = une tâche en Quand je peux » et
   « un bug = tout le backlog vidé dans la Boîte de réception le jour de la mise à jour ». Il ne
   sera retiré qu'avec la suppression de la colonne `list`.

### G2 — UI projets & domaines ✅ FAITE

**But** : donner corps aux projets/domaines. Vient après F (le rail existe) car l'arbre est
inutile tant qu'on ne peut pas cliquer dans un projet.

1. **Vue projet** : en-tête projet posé sur le canvas (titre éditable, note de projet façon
   `TodoDetailSheet`), **anneau de progression** (`ProgressRing` existant) = terminées/total,
   bouton « Terminer le projet ». Liste des tâches du projet (mêmes lignes `TodoItem`).
   ⚠️ Construire la vue en filtrant **directement par `project_id`**, jamais depuis les buckets
   de `groupTodosByDate` : une tâche datée doit apparaître à la fois dans Aujourd'hui ET dans
   son projet — ce ne sont pas des groupes GTD.
   « Terminer le projet » avec des tâches ouvertes : `AlertDialog` « Terminer aussi les N tâches
   restantes ? » (façon Things) — jamais de cascade silencieuse, jamais de tâches vivantes
   cachées dans un projet achevé.
2. **Vue domaine** : projets du domaine + tâches directes (`area_id`) ; pas de deadline.
3. **Sélection** : union discriminée en page — `{kind:'view'|'project'|'area', id?}` — et non des
   routes Next (`output: export` + le routage piloté par la donnée qui porte les animations).
   Gérer le cas « projet sélectionné supprimé ailleurs » → repli sur une vue par défaut.
3. **Arbre Domaines/Projets** dans le rail (`PlannerRail`) : Domaines dépliables → Projets,
   pastille active glissante. CRUD (créer/renommer/supprimer/déplacer-projet-vers-domaine) via
   menus contextuels (shadcn `ContextMenu`) et `AlertDialog` pour le destructif.
4. **Affecter une tâche** : contrôle « Projet » dans `TodoDetailSheet` (remplace/complète
   l'actuel `ListControl`), + option de menu contextuel sur la ligne.
5. **Arbre Domaines/Projets** dans le rail + affectation par menu contextuel (le contrôle Projet
   du détail, la réconciliation et la fin d'écriture de `list` sont déjà faits en G1).

**Tester** : créer un domaine et un projet dedans ; y déplacer des tâches ; l'anneau reflète la
progression ; terminer un projet ; renommer/supprimer avec confirmation.

**Fichiers clés** : `app/(app)/` (routes/vues projet & domaine), `components/planner/`,
`components/todo/TodoDetailSheet.tsx`, `components/todo/ListControl.tsx`.

---

## Phase H — Tags & filtrage ✅ FAITE

**But** : contexte transverse. Tags **plats** (lean : `parent_id` en base mais pas d'UI d'arbre).

1. **Liaison backend** : `Todo.tags` (`#[sqlx(skip)]`) peuplé par `attach_relations` — helper
   UNIQUE qui attache sous-tâches ET tags (`db::get` inlinait son attache : piège à oubli).
   `set_todo_tags` = replace-all en transaction, `INSERT OR IGNORE` (un id dupliqué violerait la
   clé composite), seul écrivain de `task_tags`.
2. **Fan-out (le vrai bug du plan initial)** : un tag est dénormalisé dans le payload `Todo` ET
   dans son texte d'embedding. Renommer/supprimer un tag doit donc marquer `needs_embedding = 1`
   sur **toutes** les tâches porteuses **et** émettre `todos:changed` (pas seulement
   `tags:changed`) — sinon embeddings périmés (panne silencieuse) et pastilles périmées (visible).
   `delete_tag` flague **avant** de purger `task_tags`, sinon la liste des tâches est déjà perdue.
3. **UI** : `TagControl` (multi-sélection + création inline, `modal`) à côté de `ProjectControl` ;
   chips dans `TodoMetaLine`, cliquables pour filtrer (`stopPropagation` — la ligne ouvre le
   panneau) via un **contexte** `TagFilterProvider` (éviter de traverser 6 composants).
4. **Filtrage** : `ListFilter` devient un filtre par **tag** et remplace le filtre projet — une
   seule dimension. Le rattachement se navigue au rail ; deux rangées de chips poseraient une
   question de ET/OU que l'UI ne sait pas exprimer.
5. **Capture `#projet @tag`** (convention Todoist) : `#` reste le projet — le repointer vers les
   tags casserait l'habitude construite en G1. Regex tags **globale** et exigeant début/espace
   avant `@` : sans ça, `jean@example.com` créerait un tag « example ». Tags posés APRÈS création
   (`set_todo_tags` reste seul écrivain), dans le planner **et** la capture Alt+Q. Surlignage
   émeraude dans l'overlay (date=bleu, projet=violet, tag=émeraude).

**Reporté** : quick-find par tag → phase L (facette de recherche).

**Fichiers clés** : `src-tauri/src/db.rs`, `components/todo/{TagControl,TodoMetaLine,ListFilter}.tsx`,
`features/tags/`, `features/todos/smartParse.ts`, `hooks/useTags.ts`.

---

## Phase I — Dates avancées (deadline vs planification) ✅ FAITE

**But** : exploiter la distinction déjà présente en base (`scheduled_for` vs `due_date`), que
l'UI synchronisait systématiquement.

1. **Migration 0012 (l'oubli qu'a attrapé fable)** : tous les chemins d'écriture ayant toujours
   dual-writé, `due_date == scheduled_for` sur tout l'historique — une égalité qui ne porte
   AUCUNE intention d'échéance. `UPDATE todos SET due_date = NULL WHERE due_date = scheduled_for`,
   en **migration SQL** (doit tourner exactement une fois : après I, l'égalité redevient une
   intention légitime qu'un rejeu au démarrage écraserait). Sans ça : badges rouges rétroactifs
   sur tout l'historique + routage faussé.
2. **Découplage** : « Planifiée » et « Échéance » sont deux lignes distinctes du `Sheet`
   (échéance avec compte à rebours + bouton effacer). Une date SAISIE (omnibar, Alt+Q, IA) est
   toujours une planification — l'échéance ne se pose que dans le détail. `due_date <
   scheduled_for` est permis (badge, pas de blocage).
3. **Échéance atteinte → remonte** (comportement Things) : dans `grouping.ts`, avant les tests
   de planification — dépassée → « En retard » (en-tête honnête, cohérent avec J+n) ; atteinte
   aujourd'hui → « Aujourd'hui », en préservant le découpage « Ce soir ». « Un jour » prime même
   sur une échéance dépassée (choix explicite), mais le badge J+n reste visible dans la liste.
4. **Badge** : `deadlineCountdown` (helper pur testé) → « J-3 » / « J-0 » / « J+2 », mono,
   drapeau ; `text-destructive` dès l'échéance atteinte (pas de palier orange — hors palette).
   Masqué sur une tâche terminée.
5. **Ce soir** : Switch dans le `Sheet` ; l'activer sur une tâche non planifiée aujourd'hui l'y
   planifie (« ce soir » = le soir d'aujourd'hui, pas un soir abstrait).
6. **Boucles de fond (invariant)** : `db::toggle` décale l'échéance récurrente du MÊME delta que
   la planification (« planifiée lundi, due vendredi » garde ses 4 jours) — jamais inventée si
   absente (l'ancien code l'écrasait : c'était le bug). Dérive possible sur delta calendaire →
   à revoir en Phase J. `digest_tasks` inclut les échéances atteintes et exclut `someday` (le
   digest ne doit pas annoncer ce que la vue refuse d'afficher — bug préexistant corrigé).

**Fichiers clés** : `src-tauri/migrations/0012_decouple_deadline.sql`, `src-tauri/src/db.rs`,
`features/todos/grouping.ts`, `lib/date.ts`, `components/todo/{TodoDetailSheet,TodoMetaLine}.tsx`.

---

## Phase J — Récurrences avancées

**But** : couvrir « toutes les N », « 1er lundi du mois », et surtout **après-complétion** vs
date fixe — sans RRULE complet ni table d'occurrences.

**Concepts** : modèle de récurrence structuré, matérialisation à la complétion.

1. **Modèle structuré** (colonnes ou JSON sur `todos`, migration `0012_*`) :
   `freq(day/week/month/year)` + `interval(N)` + `byweekday(set)` + `bymonthday` +
   `bysetpos` (⇒ « 1er lundi » = freq=month, byweekday=MO, bysetpos=1) + `mode(fixed|after_completion)`.
   Mapper l'enum existant (`daily/weekdays/weekly/monthly`) dessus dans la migration (conversion
   sans perte).
2. **Logique** : étendre `Recurrence::advance` (`src-tauri/src/models/task.rs`) ; **garder la
   matérialisation-en-avant à la complétion** dans `db::toggle` (pas d'historique d'occurrences).
3. **UI** : éditeur de récurrence dans le `Sheet` (segments + popover) remplaçant le `Select`
   figé actuel (`TodoDetailSheet.tsx:258-274`).

**Tester** : « toutes les 2 semaines », « 1er lundi » avancent correctement ; une tâche
after-completion ne se reprogramme qu'une fois cochée.

**Fichiers clés** : `src-tauri/src/models/task.rs`, `src-tauri/src/db.rs`,
`features/todos/recurrence.ts`, `components/todo/TodoDetailSheet.tsx`.

---

## Phase K1 — Manipulation directe (DnD, multi-sélection, clavier)

**But** : mettre l'utilisateur aux commandes de l'ordre, comme Things — sans casser la
mécanique d'animation (LINGER, portail, `popLayout`).

**Principe réconciliateur** (voir risque n°2) : **la date choisit la SECTION, la position
choisit l'ORDRE dans la section.**
1. **DnD** : glisser DANS une section = écrire `orderings` (contexte courant) ; `sortTodos`
   trie d'abord par `position` du contexte, puis retombe sur priorité/date pour les non
   ordonnées. Glisser VERS une autre section = **mutation de replanification/affectation**
   (`scheduled_for`, `project_id`…), exactement comme un toggle aujourd'hui → `groupTodosByDate`
   reste pure, LINGER/portail intacts. Suspendre l'anim `layout` de la section pendant un drag
   actif (changement local à `app/(app)/page.tsx`, pas au modèle).
2. **Multi-sélection + actions par lot** : sélection (clic + Shift/Ctrl), barre d'actions
   (planifier / déplacer vers projet / terminer / supprimer) réutilisant les mutations
   existantes en boucle.
3. **Navigation clavier** : flèches pour naviguer, Espace pour ouvrir le `Sheet`, raccourcis de
   planification (aujourd'hui/demain/someday), le tout centralisé.

**Tester** : réordonner dans une section persiste ; glisser vers Demain replanifie ; tout
pilotable au clavier ; actions par lot sur 3 tâches.

**Fichiers clés** : `app/(app)/page.tsx`, `features/todos/sort.ts`, `components/todo/`,
nouvelle lib DnD (privilégier une lib compatible React 19 + `motion`).

---

## Phase K2 — Undo par toast (à un pas)

**But** : « Annuler » sur chaque action réversible (au-delà de la suppression déjà couverte).

1. **Mécanique** : chaque mutation réversible (compléter, replanifier, déplacer, lot) renvoie de
   quoi rejouer son inverse ; toast sonner « Annuler » (déjà utilisé partout).
2. **Cas récurrence** : annuler la complétion d'une tâche récurrente doit ramener
   `scheduled_for`/`due_date`/`remind_at`/`reminded` à leur valeur d'avant (db::toggle les
   avance — capturer l'état avant pour l'inverse).

**Tester** : cocher puis Annuler restaure exactement l'état ; replanifier par lot puis Annuler
revient en arrière.

**Fichiers clés** : `features/todos/useTodoMutations.ts`, `src-tauri/src/db.rs`.

---

## Phase L — Recherche & capture avancée

**But** : Quick Find global + duplication/modèles.

1. **Quick Find** : exposer la recherche (déjà amorcée : `components/SearchOverlay.tsx`,
   `features/search/`) en palette globale — tâches, projets, tags, notes (fusion lexicale +
   sémantique existante via le sidecar).
2. **Duplication / modèles** : dupliquer une tâche ou un projet (avec ses tâches/sous-tâches)
   comme gabarit réutilisable — commande Rust `duplicate_*` + option de menu contextuel.

**Tester** : Quick Find trouve un projet et une tâche ; dupliquer un projet recrée sa structure.

**Fichiers clés** : `components/SearchOverlay.tsx`, `features/search/`, `src-tauri/src/commands.rs`.

---

## Phase M — Vue « À venir » calendaire

**But** : la vue Upcoming de Things — calendrier des jours/semaines à venir, tâches datées +
occurrences futures des récurrences.

1. **Rendu calendaire** : la vue À venir affiche les tâches par jour futur ; les récurrences
   projettent leurs **occurrences futures calculées à la volée** depuis la règle (§J), en
   lecture seule (pas de matérialisation).
2. **Réutilise** le style de section `zoom` déjà réservé à `upcoming`.

**Hors périmètre** (rappel) : aucun événement de calendrier système affiché.

**Tester** : une tâche planifiée dans 10 jours et une récurrence hebdo apparaissent aux bons
jours à venir.

**Fichiers clés** : `components/planner/section-styles/ZoomList.tsx`, `app/(app)/page.tsx`,
`features/todos/recurrence.ts`.

---

## Phase N — Thème « Noir pur » (OLED) & polish

**But** : finitions visuelles et confort.

1. **Noir pur** : variante de thème OLED (fond quasi noir) en plus de clair/sombre, via un bloc
   de tokens dans `app/globals.css` et une option dans `ThemeSetting`. Rester compatible avec
   les 6 accents et le mécanisme next-themes existant.
2. **Icônes-signature animées** (voir Stratégie d'icônes) : consolider l'animation maison des
   icônes clés en Lucide via `lib/motion.ts` (coche, cloche, « répéter », entrée du rail),
   états actifs `fill`. Aucune lib Lottie.
3. **Polish** : états vides (`Empty`), squelettes, tooltips, cohérence copy FR (sentence case,
   verbes actifs), passage `prefers-reduced-motion`, vérif accessibilité des nouveaux contrôles.

**Tester** : bascule Clair/Sombre/Noir pur ; les accents restent lisibles ; reduced-motion
respecté sur DnD et rail.

**Fichiers clés** : `app/globals.css`, `components/settings/ThemeSetting.tsx`, transversal.

---

## Reporté (passe ultérieure, hors « lean »)
- **G2 — En-têtes de projet (Headings)** : UI de sections internes de projet (colonnes/étapes).
  Table `headings` déjà créée en E ; n'ajouter l'UI qu'une fois les projets bien vécus.
- **Tags imbriqués** : UI d'arbre de tags (`tags.parent_id` déjà présent).

---

## Risques principaux (et parades retenues)

1. **Ordre manuel par contexte** : un `position` global ne suffit pas (l'ordre dans un projet ≠
   dans Aujourd'hui). → table `orderings(context, todo_id, position)` dès E.
2. **DnD vs animations** : réordonner pendant `layout`/`popLayout` peut « sauter ». → date =
   section (mutation), position = ordre intra-section ; suspendre `layout` de la section en
   cours de drag.
3. **E doit être invisible côté UI** : dual-write `list`, dérivation `lists` conservée jusqu'à G.
4. **Navigation** : rail DANS le Planificateur pour ne pas dédoubler le comportement entre dock
   et sidebar.
5. **Sémantique dates/récurrence** : I et J touchent `scheduled_for`/`due_date` → revérifier
   `reminders.rs` (rappels + digest) à chaque fois.

---

## Vérification globale (end-to-end)

Chaque phase se teste isolément dans l'app lancée (`.claude/launch.json`) :
- **E** : migrations OK sur base existante, un projet par ancienne liste, UI inchangée, ts-rs OK.
- **F** : 6 vues navigables ; Inbox se vide en planifiant ; Ce soir ; Journal par date.
- **G** : domaine→projet→tâches ; anneau de progression ; terminer/renommer/supprimer projet.
- **H** : multi-tags ; filtre par tag ; `#a #b` à la capture.
- **I** : J-3 sans changement de section ; Ce soir.
- **J** : « toutes les 2 semaines », « 1er lundi », after-completion.
- **K1** : réordonner persiste ; glisser=replanifier ; clavier ; lot.
- **K2** : Annuler restaure l'état exact (y compris récurrence).
- **L** : Quick Find multi-entités ; duplication de projet.
- **M** : occurrences futures aux bons jours.
- **N** : Clair/Sombre/Noir pur + accents + reduced-motion.

**Principe directeur** (repris de la roadmap existante) : une phase n'est entamée qu'une fois la
précédente testée ; le schéma est verrouillé tôt (E) pour éviter les passes répétées ; on ne
mélange jamais deux sources de bugs.
