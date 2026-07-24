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

## Phase J — Récurrences avancées ✅ FAITE

**But** : « toutes les N », « 1er lundi du mois », **après-complétion** vs date fixe — sans
RRULE complet ni table d'occurrences.

1. **Modèle : enum + modificateurs** (déviation validée par fable — plutôt qu'une structure
   JSON) : l'enum `recurrence` existant RESTE la fréquence ; migration `0013` ajoute
   `recur_interval` (défaut 1, CHECK >= 1), `recur_weekday`, `recur_setpos`, `recur_mode`
   (fixed | after_completion). Les défauts reproduisent exactement l'ancien comportement →
   **aucun backfill**, conversion sans perte par définition, zéro ripple frontend
   (`!== "none"` inchangé). `bymonthday` abandonné : redondant avec la date d'ancrage —
   SAUF fin de mois (un ancrage au 31 se borne au 28 et n'y revient jamais) → couverte par
   **`setpos = -1` sans weekday = « dernier jour du mois »**. Non-objectif assumé : les
   ensembles de jours (« lun/mer/ven »).
2. **Sémantique strict-après** (`RecurrenceRule::advance`) : la prochaine occurrence est
   STRICTEMENT postérieure à la base — avec `>=`, une tâche « 1er lundi » cochée le 1er lundi
   se renverrait elle-même et ne bougerait plus jamais. Base désalignée avant l'occurrence du
   mois → rattrapée (ne pas sauter d'occurrence). « Dernier » calculé depuis la FIN du mois
   (« dernier vendredi » ≠ « 4e » : un mois en compte 4 ou 5).
3. **Après-complétion** : base = jour où l'on coche. Réservé aux règles simples
   (daily/weekly/monthly × intervalle) — masqué pour jours ouvrés et positionnel (façon
   Things). Le delta échéance/rappel s'ancre sur l'ANCIENNE date planifiée, pas sur la base :
   sinon les écarts seraient faussés. Sémantique d'échéance déclarée : « due N jours après
   l'occurrence » — le delta la préserve exactement à chaque saut (la note de dérive de la
   Phase I était une fausse alerte, close).
4. **Miroir JS** (`recurrence.ts`) réécrit en arithmétique (y, m, d) pure : `setMonth(+1)`
   déborde (31 janv → 3 mars) là où chrono borne (28 févr) — l'optimiste aurait « fliqué » ;
   jamais de `new Date("YYYY-MM-DD")` (UTC → veille en fuseau négatif) ; numérotation chrono
   (0 = lundi ≠ `getDay()`). **Table de parité** : les mêmes cas testés côté Rust et côté JS.
5. **UI** : rangées conditionnelles dans le `Sheet` — fréquence, intervalle (masqué pour jours
   ouvrés), positionnel mensuel (ancrage / 1er..4e / dernier <jour> / dernier jour du mois),
   base du report. `i64 → number` forcé côté ts-rs (`#[ts(type)]`) : le `bigint` par défaut
   contaminait les spreads.

**Fichiers clés** : `src-tauri/migrations/0013_recurrence_modifiers.sql`,
`src-tauri/src/models/task.rs`, `src-tauri/src/db.rs`, `features/todos/recurrence.ts`,
`components/todo/TodoDetailSheet.tsx`.

---

## Phase K1 — Manipulation directe

**Principe** : **la date choisit la SECTION, la position choisit l'ORDRE dans la section.**

### K1a — Drag & drop ✅ FAITE (à valider dans l'app réelle)

1. **Lib : pragmatic-drag-and-drop** (revue fable) — motion `Reorder` ne sait pas faire de
   cible inter-conteneurs (rail), et dnd-kit ferait tourner DEUX systèmes de projection
   (le sien + celui de motion). pdnd ne possède rien : **aucun réordonnancement en vol** —
   pendant le drag, seul un trait `--brand` marque le bord d'insertion (le DOM ne bouge pas,
   la projection `layout` n'a rien à combattre) ; au drop, l'état React change et les props
   `layout` existantes animent le règlement avec les ressorts maison. Rien à suspendre.
2. **Gate Tauri** : `dragDropEnabled: false` sur la fenêtre principale (sinon Tauri intercepte
   le drag natif et WebView2 ne délivre jamais les événements HTML5). ⚠️ À vérifier au premier
   `pnpm tauri dev` — c'est LA plus grosse inconnue ; repli documenté : dnd-kit + suspension.
3. **Backend** : `set_ordering(context, ordered_ids)` = remplacement complet transactionnel —
   double emploi : **auto-cicatrisant** (une tâche supprimée/replanifiée disparaît au prochain
   remplacement, aucun nettoyage en cascade) et il élimine l'état mixte (le premier drag fige
   l'ordre affiché de TOUTE la section). Pas de positions fractionnaires.
4. **Ordre appliqué au rendu, par contexte** (`applyOrdering`) : les non-positionnées passent
   DEVANT (une capture fraîche reste visible — la récompense de l'Omnibar) ; entre positionnées,
   la position SEULE (pas de règle « pending d'abord » qui ferait sauter une ligne cochée en
   pause LINGER). Contextes ordonnés : today, inbox, anytime, someday, project:<id>. En retard
   reste trié par retard (son travail est de rappeler chronologiquement) ; Demain/À venir par
   date — leurs lignes restent néanmoins des SOURCES de drag (glisser une tâche en retard sur
   « Aujourd'hui » est le cas d'usage n°1).
5. **Dépôt sur le rail = mutation** : mapping pur `dropIntent` (testé) — Aujourd'hui planifie
   (et sort de Ce soir), À venir → demain, Un jour → drapeau, Boîte de réception → dé-trie
   entièrement, projet → affecte (et quitte le domaine direct). Refus : Journal (terminer est
   un geste, pas un dépôt) et Quand-je-peux sans rattachement (la tâche retomberait en inbox —
   un dépôt qui atterrit ailleurs que sur sa cible est pire qu'un dépôt refusé). No-op → aucune
   écriture. Une ligne en pause LINGER n'est pas déplaçable (`canDrag`).
6. DnD réservé au style « Liste » (une ligne compressée n'est pas une poignée honnête).

### K1b — Navigation clavier ✅ FAITE

Sur une ligne focalisée : **↑/↓** naviguent entre lignes (roving focus par requête DOM sur
`[data-todo-row]` — traverse les sections dans l'ordre de lecture, marche partout où `TodoItem`
est monté) ; **Espace/Entrée** ouvrent le détail ; **t/d/s** planifient (aujourd'hui/demain/
un jour) ; **Suppr** supprime. Focus visible via `focus-within` (même surbrillance que le survol).
**Alt+↑/↓** déplacent dans un contexte ordonné (`AnimatedTodoList`, là où l'ordre existe) —
quasi gratuit : même `onReorder` que le drag ; le nœud focalisé garde le focus à travers
l'animation `layout` (le focus suit l'élément, pas la position), donc rien à re-focaliser. Les
raccourcis n'agissent que si la div-ligne ELLE-MÊME est ciblée et sans modificateur (Alt+flèches
remonte au réordonnancement). **Bug Phase I corrigé au passage** : le menu contextuel
« Aujourd'hui/Demain » écrivait encore `due_date` en double.

### K1c — Multi-sélection ✅ FAITE

Version **lean** (fable : pas de lasso ni d'aperçu multi-lignes au drag — le coûteux). Logique
pure testée (`selection.ts`) : **Ctrl/Cmd+clic** bascule, **Maj+clic** sélectionne la plage
ancre→cible ; un **clic simple** n'est pas consommé (ouvre le détail) mais congédie une sélection
en cours. Distribuée par contexte (`selection-context.tsx`, comme `TagFilterProvider`), l'état
possédé par la PAGE (qui en dérive la barre). Ligne sélectionnée = `bg-brand-soft ring-brand`.
**Barre d'actions** flottante au-dessus de la capture (`SelectionBar`, `.card-floating` justifié —
c'est du chrome flottant) : Aujourd'hui / Demain / Un jour / Terminer (ne coche que les en cours) /
Projet… (popover) / Supprimer, + Échap. Chaque action rejoue en boucle les mutations existantes
puis vide la sélection. `orderedIds` fourni par la page = ordre affiché exact (ancre de plage
fidèle à l'œil). Collision de nom évitée : `multiSelect` ≠ `PlannerSelection` (vue/projet/domaine).

**Fichiers clés** : `features/todos/{ordering,useOrderings}.ts`,
`components/todo/AnimatedTodoList.tsx`, `components/planner/PlannerRail.tsx`,
`app/(app)/page.tsx`, `src-tauri/tauri.conf.json`.

---

## Phase K2 — Undo par toast (à un pas) ✅ FAITE

**But** : « Annuler » sur chaque action réversible (au-delà de la suppression déjà couverte).

1. **Deux mécanismes distincts, volontairement non unifiés** (fable) : la suppression garde son
   système existant (commit DIFFÉRÉ 5 s — rien n'est encore envoyé au backend tant qu'on n'a pas
   cliqué ailleurs, `clearTimeout` suffit à annuler). Toggle/update sont déjà committés
   (backend appelé, `todos:changed` émis) au moment où le toast s'affiche : annuler doit donc
   rejouer une VRAIE seconde mutation restaurant les anciennes valeurs — jamais un `clearTimeout`.
   Un toast de suppression et un toast d'undo générique peuvent coexister brièvement (deux
   systèmes indépendants) : assumé, non corrigé.
2. **Slot unique** (`useTodoMutations.ts`, module-level, décision « à un pas ») : toute nouvelle
   action réversible remplace l'undo en attente et ferme son toast. Garde par id contre les
   **closures de toast périmées** : si l'action B remplace l'undo de A pendant que le toast de A
   est encore affiché (jusqu'à 5 s), cliquer sur son « Annuler » ne doit RIEN faire — sans cette
   garde on aurait un undo à deux niveaux qui viole la règle « à un pas ». Armé APRÈS résolution
   de l'IPC (jamais avant).
3. **Le seul vrai piège** (`features/todos/undo.ts`, extrait en module PUR pour le tester sans
   dépendance framework — `useTodoMutations.ts` importe `@/lib/swr-config` en valeur, non
   résolvable par vitest sans plugin d'alias) : sur une tâche récurrente, `toggle()` n'achève pas,
   il AVANCE `scheduled_for`/`due_date`/`remind_at`. Rejouer `toggle()` pour « annuler » avancerait
   une SECONDE fois — ça ne l'annulerait pas. `restorePayloadForToggle` restaure explicitement les
   trois champs vers leurs valeurs d'origine, jamais via un second `toggle()`.
4. **`updateTodo` généralisé** : capture les valeurs d'AVANT pour les seules clés du payload
   (`pickForRestore`) et arme un undo — ce qui rend réversibles À LA FOIS l'édition dans le
   panneau de détail, le dépôt sur le rail (K1a) et les raccourcis du menu contextuel, sans code
   dédié par site d'appel. `skipUndo` : utilisé par la restauration elle-même (jamais
   d'undo-de-l'undo) et par les fonctions de lot.
5. **Lot (K1c)** : `updateManyTodos`/`toggleManyTodos` — snapshot par tâche AVANT mutation,
   **UN SEUL** toast restaure chacune à sa propre valeur d'avant (le lot est une unité, pas N
   annulations indépendantes qui se remplaceraient). `Promise.allSettled`, pas `Promise.all` :
   une restauration en échec ne doit pas annuler les N-1 autres.
6. **Raccourci Ctrl/Cmd+Z** : rejoue le même slot (accélérateur, pas un historique). Garde
   obligatoire : no-op si le focus est dans `input`/`textarea`/`contenteditable`, sinon on avale
   l'undo texte natif de l'Omnibar ou de l'éditeur de notes.

**Hors périmètre assumé** : réordonnancement seul (`set_ordering`, position pure, aucun risque de
perte de données) ; création (supprimer EST l'undo) ; survie d'un projet/tag auto-créé après undo
d'une affectation (le supprimer serait plus effrayant que le garder).

**Fichiers clés** : `features/todos/{undo,useTodoMutations}.ts`, `hooks/usePlannerTodos.ts`,
`app/(app)/page.tsx`.

---

## Phase L — Recherche & capture avancée ✅ FAITE

**But** : Quick Find global + duplication/modèles.

1. **Quick Find** : fusion **lexicale** (locale, sans le sidecar) pour projets/domaines/tags —
   la base vectorielle n'indexe que tâches/notes depuis la Phase D, l'étendre serait un chantier
   Python à part, hors périmètre. `lexicalMatch` (`features/search/lexical.ts`, pur, testé) :
   sous-chaîne insensible à la casse ET aux **diacritiques** (NFD) — NOCASE seul (SQLite) ne
   suffit pas pour une app en français, « epic » doit matcher « Épicerie ». Classement : préfixe
   > position > longueur. Synchrone à chaque frappe (filtre en mémoire, pas de débounce) ; la
   sémantique (tâches/notes, sidecar) reste débattue 250 ms. Regroupement par type dans la
   palette (Projets, Domaines, Tags, Tâches, Notes — ordre façon Things). Clé composite
   `kind:id` : un projet et une tâche peuvent partager un id selon le schéma.
2. **Deep-link Quick Find → planner** (le point le plus risqué, verrouillé) : sélectionner un
   résultat navigue vers `/?project=`/`?area=`/`?tag=`/`?task=`, consommé par un effet **keyé sur
   la valeur du paramètre** (pas une lecture au montage seul — sinon un second choix alors qu'on
   est DÉJÀ sur `/` serait ignoré, Next ne remonte pas la page sur une navigation de même route),
   puis `router.replace("/")` pour que retour/rafraîchissement ne rejouent pas la sélection. Pour
   une tâche : une seule tentative une fois les tâches chargées (pas de ré-essai indéfini sur un
   id supprimé), résolution du projet/domaine parent AVANT ouverture d'un `TodoDetailSheet`
   **autonome** (pas lié à une ligne montée — la tâche vient d'atterrir dans sa branche). Page
   enveloppée en `Suspense` (requis par `useSearchParams` sous export statique), même précédent
   que `app/(app)/notes/page.tsx`.
3. **Duplication** : `duplicate_todo_tx`, helper Rust partagé en transaction — texte/note/
   priorité/**règle de récurrence**/tags/sous-tâches copiés (jamais cochées, même si l'original
   l'était) ; statut/dates remis à zéro (gabarit réutilisable, pas un clone d'état). Récurrence
   copiée TELLE QUELLE en connaissance de cause : dupliquer une tâche récurrente signifie que la
   copie génère sa propre prochaine occurrence, pas un bug. `duplicate_project` copie TOUTES les
   tâches — y compris terminées, remises à faire (un projet achevé est le candidat n°1 à devenir
   un gabarit) — suffixe « (copie) » sur le projet seulement (deux projets identiques dans le
   rail prêteraient à confusion ; les tâches gardent leur nom exact). Pas d'undo dédié :
   supprimer la copie EST l'undo, même classe que la création.
4. **UI** : contexte `duplicate-context.tsx` (même parti pris que `tag-filter.tsx`) — tous les
   styles de section rendent `TodoItem` directement, threader une prop aurait touché 6+ fichiers.
   Entrée « Dupliquer » dans le menu contextuel de `TodoItem` et dans celui du projet au rail.

**Fichiers clés** : `components/SearchOverlay.tsx`, `features/search/lexical.ts`,
`features/todos/duplicate-context.tsx`, `src-tauri/src/db.rs` (`duplicate_todo_tx`,
`duplicate_project`), `app/(app)/page.tsx` (deep-link + Suspense).

---

## Phase M — Vue « À venir » calendaire ✅ FAITE

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

### Notes d'implémentation

- **`projectFutureOccurrences`** (`features/todos/recurrence.ts`) : projette les prochaines
  occurrences d'une règle en composant `advanceRule` (aucune arithmétique dupliquée — parité
  Rust/JS préservée). Exclut `recur_mode === "after_completion"` : sa prochaine occurrence
  dépend d'une date de complétion future inconnue (`nextOccurrence` calcule alors depuis
  AUJOURD'HUI, pas depuis la planification) — la projeter inventerait une date que le backend
  ne produira jamais. Bornée par `maxCount` (défaut 10) et `horizonDays` (défaut 90).
- **`buildGhostOccurrences`** (même fichier) : construit les fantômes à partir de
  **l'ensemble complet des tâches**, pas seulement de celles déjà dans `groups.upcoming` —
  piège identifié en revue d'architecture (Opus) : une tâche récurrente dont la ligne réelle
  tombe AUJOURD'HUI (donc visible dans la section Aujourd'hui) doit quand même projeter ses
  prochaines occurrences dans les jours suivants. Exclut aussi `someday`, non-`pending`, et
  sans `scheduled_for`. Respecte le filtre de tag courant de la vue.
- **Fenêtre d'affichage** : `[minDay, maxDay]` avec `maxDay` par défaut = `horizonDays` (pas de
  cutoff artificiel à J+7) — une récurrence hebdomadaire voyage à J+7, J+14, J+21… jusque dans
  les compartiments semaine/mois du style zoom, conformément au test d'acceptation de la
  roadmap (« aux bons jours à venir », au pluriel). Un premier jet avait plafonné à J+7 par
  souci de budget ; corrigé après revue car la contrainte qui justifiait la coupe (complexité
  de `CompactBucket`) ne s'appliquait plus une fois les fantômes rendus en bloc séparé.
- **`GhostRow`** (`components/planner/section-styles/GhostRow.tsx`) : composant dédié,
  purement présentationnel — pas d'id, pas de coche, pas de survol, pas de menu. `TodoItem`
  n'est PAS touché (contrat de stabilité structurelle préservé). Distinction visuelle par
  texte `muted-foreground` + glyphe ↻ + absence d'affordance (pas d'opacité globale, ambiguë
  avec un état désactivé).
- **`ZoomList`** : les fantômes rejoignent l'union des jours à traiter à CHAQUE niveau de
  zoom (jour détaillé, jour compact, semaine, mois) — un jour/semaine/mois peut n'exister que
  parce qu'une récurrence y projette sa prochaine occurrence, sans aucune tâche réelle. Rendus
  en bloc séparé sous/après le contenu réel (jamais interleaved dans l'`AnimatePresence` des
  vraies tâches) via des clés synthétiques stables (`ghost-{todoId}-{date}`) — `CompactBucket`
  reste intact, utilisé exactement comme avant pour les tâches réelles.
- **`app/(app)/page.tsx`** : `upcomingGhosts` calculé une fois (mémoïsé) depuis l'ensemble
  complet des tâches filtrées par tag, passé uniquement à la section `upcoming`. La garde
  d'affichage de section (`stackSections`, et le rendu `SectionBody`/`EmptyState`) a été
  élargie pour garder la section À venir visible si elle a des fantômes même sans aucune
  vraie tâche (calendrier vide de tâches réelles mais avec une récurrence à venir).
- **Décision utilisateur** : le badge de compteur de section reste basé sur les vraies tâches
  uniquement (peut afficher 0 à côté de fantômes visibles) — cohérent avec Things, où les
  aperçus ne comptent pas dans le badge.
- **Vérification** : 32 tests JS sur `recurrence.ts` (dont le cas « ligne réelle aujourd'hui »
  et « récurrence hebdo au-delà d'une semaine »), 117 tests JS au total, 59 tests Rust
  (inchangés — aucun code Rust modifié), `tsc --noEmit` et `next lint` propres. Vérification
  interactive en navigateur limitée par l'environnement (pas d'`invoke()` Tauri hors app) :
  compilation et montage React confirmés sans erreur console/serveur ; le rendu avec données
  réelles reste à confirmer au prochain `pnpm tauri dev`.

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

### N1 — Noir pur ✅ FAIT

Revue d'architecture faite avec opus (`Agent`/`Plan`) avant code. Note de méthode : cette
revue tournait dans un worktree isolé qui s'est avéré basé sur `origin/main` — très en retard
sur le `main` local (chantier Things entier non poussé) — l'agent l'a détecté lui-même et a
répondu de façon conditionnelle ; seule la branche « le système d'accents existe » a été
retenue, revérifiée contre le vrai dépôt avant d'écrire une ligne de code.

- **Mécanisme retenu : attribut orthogonal, pas une 3e valeur next-themes.** `data-oled` posé
  sur `<html>` par `UIPrefsProvider` (même mécanique que `data-accent` : état + localStorage
  `listik.oled` + `useEffect`), effectif uniquement combiné à `.dark`
  (`.dark[data-oled] { … }` dans `globals.css`, placé après les blocs `[data-accent="X"]`).
  Ne redéfinit QUE les surfaces (`--background`/`--card`/`--popover`/`--secondary`/`--muted`/
  `--accent`/`--border`/`--input`/`--sidebar*`) — texte, `--brand`/`--brand-foreground` et
  graphiques restent ceux de `.dark`, hérités gratuitement sur le même élément. Zéro
  duplication des 6 accents (contrairement à l'option « 3e thème » qui en aurait exigé 12).
- **UI** : interrupteur séparé dans `ThemeSetting` (pas un 4e bouton bi-action dans le
  tri-état Système/Clair/Sombre — désynchroniserait la sélection). N'apparaît que si
  `resolvedTheme === "dark"` (jamais `theme` seul : « Système » en plein jour ne doit pas
  montrer un interrupteur actif mais sans effet).
- **Compromis assumé** : comme `data-accent`, l'attribut est posé en `useEffect`
  (post-hydratation) plutôt que via un script bloquant anti-flash — cohérent avec le seul
  autre mécanisme orthogonal existant plutôt qu'un cas spécial ; un flash de la teinte sombre
  normale avant bascule Noir pur reste possible au chargement, comme pour l'accent.
- **Vérification** : câblage React confirmé (état, attribut, localStorage) via clic natif —
  le clic simulé du navigateur de test ne touchait pas ce Switch Radix précis (quirk d'outil,
  pas un bug d'app). Confirmation VISUELLE de l'override CSS bloquée : le serveur de dev déjà
  lancé par l'utilisateur ne recompilait plus (même cause que le bruit HMR `{"event":"ping"}`
  observé plus tôt) ; une deuxième instance de secours s'est révélée se contaminer via le
  cache `.next` partagé (même dossier de projet) — arrêtée immédiatement. `tsc`/`vitest`
  (117 tests)/`lint` propres. **Reste à confirmer visuellement au prochain `pnpm tauri dev`
  frais** (redémarrer le serveur de dev existant réglerait aussi le bruit HMR).

Reste N2 (icônes-signature) et N3 (polish) — voir [[things-ergonomics-roadmap]] pour le
détail de ce qui est déjà animé (coche, rail « Aujourd'hui » avec `fill`) vs statique
(récurrence/rappel dans `TodoDetailSheet.tsx`, toujours de simples icônes Lucide sans
animation ni état `fill`).

### N2 — Icônes-signature (première tranche) ✅ FAIT

- `DetailRow` (`TodoDetailSheet.tsx`) accepte un `active?: boolean` optionnel (défaut `false`,
  rétrocompatible pour toutes les lignes existantes) : le badge d'icône passe de neutre
  (`bg-foreground/[0.06] text-muted-foreground`) à teinté accent (`bg-brand-soft text-brand`)
  + un petit pop de ressort (`scale: [1, 1.15, 1]`, même vocabulaire que `TodoCheckbox`) quand
  l'état devient actif.
- Câblé sur les deux lignes qui avaient un sens booléen clair et une icône jusqu'ici statique :
  « Répéter » (`active={todo.recurrence !== "none"}`) et « Rappel »
  (`active={todo.remind_at !== null}`).
- La coche (`TodoCheckbox.tsx`) et le rail « Aujourd'hui » (`PlannerRail.tsx`, `fill` +
  `layoutId="rail-active"`) étaient déjà animés — pas retouchés.
- Volontairement PAS touché : les glyphes `Repeat`/`BellRing` dans `TodoMetaLine.tsx` (la
  ligne méta compacte sur chaque `TodoItem`) — ils sont déjà conditionnellement rendus
  (apparaissent seulement si actifs), donc il n'y a pas de bascule on/off visible à animer là ;
  l'ajouter serait un embellissement superflu, pas une consolidation.
- tsc 0 · vitest 117 · lint OK. Vérification visuelle toujours en attente (même blocage de
  serveur de dev que N1).

### N3 — Polish (audit ciblé, 2 trouvailles corrigées)

Audit ciblé (pas exhaustif, sur demande explicite) avant de coder, pour ne pas deviner
l'étendue d'un point de brief vague. Deux trouvailles concrètes, vérifiées contre le vrai
dépôt (pas de fausse piste cette fois — voir aussi [[worktree-agent-stale-origin]]) :

1. **`prefers-reduced-motion` non couvert côté CSS.** `MotionConfig reducedMotion="user"`
   (`app/layout.tsx`) ne couvre que Framer Motion ; les transitions CSS pures (hover,
   révélation de la TitleBar, `.grain`) n'avaient aucune media query. Ajouté dans
   `globals.css` : `@media (prefers-reduced-motion: reduce)` qui réduit `animation-duration`/
   `transition-duration` à ~0 globalement (`*`) — complète MotionConfig, ne le remplace pas.
2. **`aria-pressed` sur 3 sélecteurs mutuellement exclusifs** (`ThemeSetting.tsx`,
   `NavSetting.tsx`, `AccentPicker.tsx`) — sémantique de bouton-bascule indépendant, imprécise
   pour un choix « un-parmi-N » (un lecteur d'écran n'annonce ni le groupe ni la position).
   Remplacé par un `role="radiogroup"` + `role="radio"`/`aria-checked` avec tabindex flottant
   et navigation aux flèches (nouveau hook partagé `lib/use-roving-radio.ts` — mêmes
   sémantiques et code de navigation clavier factorisés une seule fois plutôt que triplés).

Pistes NON retenues après vérification (fausses pistes de la revue en worktree périmée) :
états vides/squelettes de la page Assistant (déjà présents : `EmptyAssistant`,
`ThinkingIndicator`) ; fallback clavier du DnD (déjà couvert par K1b, Alt+↑/↓).

tsc 0 · vitest 117 · lint OK. Reste du périmètre N3 (tooltips, copy FR, autres états vides)
non traité — audit volontairement limité, à recadrer avec l'utilisateur si besoin d'aller
plus loin.

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
