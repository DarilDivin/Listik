# Listik — Design System « Doux & sculpté × Bento »

> Refonte du 2026-07-07. Ce document est la référence : toute nouvelle surface
> doit se construire avec ces tokens et ces patterns, jamais avec des valeurs
> en dur.

## 1. Philosophie

- **Chaleureux et tactile** : neutres chauds légèrement teintés (jamais de gris
  pur), grandes cartes arrondies qui « flottent » sur des ombres douces,
  sensation Things 3 modernisée.
- **Bento** : les informations clés (progression, compteurs) vivent dans des
  widgets — gros chiffres tabulaires, anneau de progression, cartes modulaires.
- **Un seul accent, choisi par l'utilisateur** : toute la couleur « vive » de
  l'app passe par `--brand` (Réglages → Personnalisation). Exceptions codifiées :
  les priorités des tâches (rouge/émeraude), le destructif, et les pastilles
  d'icône de Réglages (une teinte par ligne, façon iOS Settings — voir 4.3).
- **Le motion est un matériau** : tout ce qui change d'état bouge avec une
  physique de ressort (jamais de durée linéaire sèche), et respecte
  `prefers-reduced-motion` (via `MotionConfig reducedMotion="user"`).

## 2. Tokens

### 2.1 Couleurs neutres (`app/globals.css`)

Neutres **chauds** en oklch (teinte 60–85, chroma ≤ 0.014). Rôles :

| Token | Rôle |
|---|---|
| `--background` | Canvas de l'app (légèrement teinté, jamais blanc) |
| `--card` | Surfaces sculptées (presque blanc chaud / brun-gris élevé en sombre) |
| `--muted` / `--secondary` | Fonds de contrôles (segmented, inputs) |
| `--accent` | Survols de lignes/menus (≠ accent utilisateur !) |
| `--border` | Hairlines uniquement — jamais de bordure « dure » autour d'une carte |
| `--destructive` | Suppressions, erreurs |

Règle : **ne jamais introduire de `bg-slate-*`, `#hex` ou oklch en dur** dans
un composant — uniquement les tokens sémantiques (`bg-background`, `bg-card`,
`text-muted-foreground`…).

Exception codifiée — **ombre de contact des pouces de segmented control**
(`FilterTabs`, `Segmented`) : un noir/blanc en alpha
très faible (`shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]
dark:ring-white/[0.07]`) plutôt qu'un token — un token neutre teinté serait
trop visible à ce niveau de subtilité. Réservé à ce micro-relief précis, pas
un blanc-seing pour d'autres usages.

### 2.2 Accent utilisateur

- `--brand` : la couleur d'accent active. `--brand-foreground` : texte posé
  dessus. `--brand-soft` : lavis dérivé automatiquement
  (`color-mix(in oklch, var(--brand) 11%, transparent)`, 16 % en sombre).
- 6 presets calibrés light/dark : `teal` (défaut), `indigo`, `violet`,
  `coral`, `amber`, `rose` — blocs `[data-accent="…"]` dans `globals.css`.
- Sélection : `UIPrefsProvider` (`components/ui-prefs.tsx`) pose
  `data-accent` sur `<html>` et persiste dans `localStorage` (`listik.accent`).
- **Ajouter un accent** : ① bloc light + bloc `.dark[data-accent=…]` dans
  `globals.css` ; ② entrée dans `ACCENTS` (`ui-prefs.tsx`) ; ③ pastille dans
  `SWATCH` (`components/settings/AccentPicker.tsx`).
- Usages canoniques de l'accent : progression (anneau, jauges), états actifs
  (pastilles de nav, chips, coche des tâches), sélections (note active, bulle
  de question, `::selection`), célébrations (lueur 100 %), halos de page
  (`var(--brand-soft)` en radial très doux).
- `--ring` (focus) = `var(--brand)` : le focus clavier suit l'accent.

### 2.3 Priorités (hors accent)

Anneau de la checkbox uniquement, via `features/todos/priority.ts` :
haute = `#ef4444`, basse = `#10b981`, normale = neutre. Ne pas les décliner
ailleurs.

### 2.4 Rayons

`--radius: 1rem`. Échelle pratique : contrôles `rounded-lg/xl` (12–16 px),
cartes `.card-soft` (20 px), dock/hero `.card-floating` (24 px), pastilles
`rounded-full`. Un élément posé DANS une carte est toujours moins arrondi que
la carte.

### 2.5 Ombres — élévation réservée au chrome flottant

**Décision (2026-07-11) : le contenu ne vit JAMAIS dans une carte élevée.**
Tâches, hero du planner, groupes de réglages, exemples de l'assistant —
tout est posé **directement sur le canvas** (`--background`), séparé par de
simples hairlines (`border-t border-border/60` / `divide-y divide-border/60`).
Pas de `bg-card`, pas de `box-shadow`, pas de coin arrondi qui délimite une
« carte » de contenu. L'ancien utilitaire `.card-soft` a été supprimé —
**ne pas le réintroduire.**

`.card-floating` est le seul vestige d'élévation, et il est **réservé au
chrome qui doit visuellement flotter au-dessus du contenu** : le dock de
navigation (`FloatingDock`) et la fenêtre de capture rapide (`/quick`, dont
l'ombre simule celle d'une fenêtre OS puisque la fenêtre Tauri est
transparente et sans décorations). N'importe quel autre usage de
`.card-floating` doit être remis en question.

La fenêtre `/quick` n'utilise pas `.card-floating` telle quelle (son fond est
déjà celui de l'Omnibar, pas `--card`) : elle réutilise seulement l'ombre via
l'utilitaire jumeau `.shadow-floating` (même recette oklch, même variante
sombre — jamais de `rgba(0,0,0,…)` en dur pour cette ombre).

Le panneau du tray (`/tray`, clic gauche sur l'icône de la zone de
notification, Windows) fait l'inverse : fenêtre **opaque** (`bg-background`)
avec l'ombre du système (`shadow: true`), qui lui donne sous Windows 11 les
coins arrondis, le liseré et l'ombre des panneaux natifs (son, réseau). Pas de
CSS d'ombre ni de marge transparente. Dedans, la règle commune : contenu à
plat, groupes séparés par des hairlines `border-border/60`, pastilles
`bg-brand-soft text-brand` pour les trois modes de capture.

Pour les petites pastilles d'icône (hero de l'Assistant, modes de capture du
panneau du tray), utiliser `bg-brand-soft text-brand` — un aplat teinté, pas
une carte. Jamais pour un état vide (voir §4.7).

### 2.6 Typographie

- **Geist Sans** partout. Displays : poids 600–800 + tracking serré
  (`tracking-[-0.02em]` et plus serré quand plus gros). Pas de serif, à une
  exception près : **Fraunces**, la police du logotype L!stik
  (`app/fonts/fraunces.woff2`, chargée par `next/font/local`), porte les
  titres de l'accueil du premier lancement (`components/onboarding/`), le seul
  moment de marque de l'app. Ne pas l'étendre aux pages courantes.
- **Logotype** : `ListikLogotype` / `ListikMark` (`components/brand/ListikLogo.tsx`) ;
  la goutte suit `--brand`, voir `brand/README.md`. Son entrée animée est
  `ListikLogoMotion` (`components/brand/ListikLogoMotion.tsx`) : une vidéo WebM
  transparente par thème (`public/brand/listik-splash-*.webm`), rendue par
  Remotion depuis `motion/` (coupe « splash »), monochrome, goutte comprise. Elle
  sert à l'écran d'ouverture (`components/SplashScreen.tsx`, une fois par
  lancement) et au premier écran de l'accueil. Pour la changer : modifier la
  composition, la rendre (voir `motion/README.md`) et remplacer les deux vidéos.
- **Geist Mono** : compteurs, pourcentages, raccourcis (`Kbd`) — toujours
  `tabular-nums`.
- Échelle utilitaire : `.text-large-title` (2 rem/700, titres de page pleine —
  Réglages, Assistant), `.text-title-2` (1.3125 rem/600, titres de colonne/
  section plus étroite — rubriques des Réglages), `.text-headline`. Gros chiffre bento :
  `font-mono text-2xl font-semibold tabular-nums` (voir `HeroDay`). Toute
  nouvelle page doit choisir un de ces trois paliers plutôt qu'une taille
  Tailwind ad hoc (`text-2xl`, `text-3xl`…) — le hero du Planificateur
  (`HeroDay`, `text-[2.6rem]`) reste le seul écart volontaire, car c'est un
  widget bento, pas un titre de page.

### 2.7 Matière

- `.grain` : bruit fractal en soft-light (0.03 clair / 0.05 sombre), posé une
  fois dans le layout racine. Ne pas le dupliquer.
- Halos de page : `radial-gradient(... var(--brand-soft), transparent)` en
  haut du canvas, `pointer-events-none`, z-0.

## 3. Motion (`lib/motion.ts`)

| Preset | Usage |
|---|---|
| `spring.snappy` | Micro-interactions : pastilles qui glissent (`layoutId`), pressables |
| `spring.smooth` | Entrées de contenu, layout, captions |
| `spring.bouncy` | Badges/coches qui « pop » |
| `spring.gentle` | Grands mouvements, listes |
| `spring.pop` | Entrée des widgets/cartes bento et du dock |
| `pressable` | `whileTap {scale: 0.97}` à étaler sur tout élément cliquable |

Patterns codifiés :
- **Pastille glissante** : l'état actif d'un groupe est un `motion.span`
  `layoutId` partagé (dock `dock-active`, sidebar `sidebar-active-pill`,
  filtres `filter-thumb`, listes `list-filter-pill`, accent `accent-ring`,
  rubriques des
  Réglages `settings-nav-pill`) — jamais deux groupes avec le même
  `layoutId`.
  `Segmented` (`components/ui/segmented.tsx`) tire le sien de `useId()` :
  plusieurs instances sur une page ne se volent pas leur pouce.
- **Cascade** : sections/cartes entrent avec `delay: i * 0.05` + `spring.smooth`.
- **Ticker** : tout chiffre qui change passe par `AnimatedNumber`
  (`components/ui/animated-number.tsx`).
- **Anneau** : progression circulaire = `ProgressRing`
  (`components/planner/ProgressRing.tsx`), `pathLength` à ressort.
- **Célébration** : à la transition vers 100 % seulement (pas au montage) —
  lueur radiale `--brand` + pop d'échelle (voir `HeroDay`).
- **Listes** : `AnimatePresence mode="popLayout"` + `layout` complet sur les
  wrappers de lignes, sous un `LayoutGroup`, pour que les voisines glissent en
  ressort (position ET taille) quand une ligne apparaît/disparaît/change de
  hauteur (voir `AnimatedTodoList`). Le `layout` complet ne pose de problème
  d'étirement de texte QUE si la ligne change de taille *pendant une
  interaction fréquente* (survol) — ce qu'on a supprimé : la ligne de tâche est
  désormais purement d'affichage (voir §4.6). On garde `layout="position"`
  uniquement sur les wrappers dont la taille est déjà pilotée à la main
  (compression d'`HorizonRow`, conteneurs de buckets à `height:auto`).
- **Pause de complétion** : (dé)cocher une tâche la laisse ~0,9 s dans sa
  section — le temps que la coche se trace et que l'œil enregistre — puis elle
  glisse vers sa vraie section. Routage patché au niveau de la page
  (`LINGER_MS` dans `app/(app)/page.tsx`) ; le pouls du jour (anneau,
  compteurs), lui, réagit immédiatement.
- **Chrome escamotable** : un bloc d'en-tête qui doit s'effacer (mode portail)
  se replie en hauteur animée (`height: auto ↔ 0`), jamais par démontage sec —
  aucun saut de layout. Le portail réutilise le MÊME nœud de section (clé
  React stable) qui morphe via `layout="position"`, et le titre grossit en
  `fontSize` animée sur le même élément (pas de swap qui ferait sauter le texte).
- **Sticky** : un élément `sticky` ne colle que dans les limites de son parent.
  La barre de filtres est donc un enfant direct de la colonne (qui contient
  aussi les sections) et porte elle-même son repli — `overflow-hidden` est
  permis sur l'élément sticky lui-même, jamais sur un ancêtre intermédiaire.
- **Chips méta révélés au survol** : réservés aux barres de saisie toujours
  visibles (Omnibar), plus aux lignes de tâche (voir §4.6). Si un wrapper
  révélé au survol est nécessaire, l'englober dans un `motion.span` en `flex`
  (jamais `inline-block`, dont la line-box héritée grandit la ligne au survol).
- **Transitions de page** : `app/(app)/template.tsx` (fade + y, ease expo).

## 4. Composants et patterns

### 4.1 Chrome fenêtre — NE PAS TOUCHER

`components/TitleBar.tsx` (icônes Fluent UI) + le système de révélation au
survol dans `app/layout.tsx` (bande haute, hauteurs
`h-[calc(100vh-32px)]/h-[calc(100vh-8px)]`) sont **verrouillés** par décision
utilisateur.

### 4.2 Navigation (au choix de l'utilisateur, `listik.nav`)

- **Dock flottant** (`components/FloatingDock.tsx`, défaut) : pilule verticale
  `.card-floating` fixée à gauche, icônes 44 px, tooltips à droite, pastille
  `--brand-soft` glissante, lift au survol. Le contenu réserve `pl-20`.
- **Sidebar** (`components/AppSidebar.tsx`) : shadcn Sidebar `collapsible="icon"`
  (Ctrl+B), ancrée `absolute` sous la TitleBar, fond canvas sans bordure,
  items `rounded-xl`, actif = pastille `--brand-soft` + texte/icône `--brand`.
- Bascule dans `app/(app)/layout.tsx` via `useUIPrefs().nav`.

### 4.3 Surfaces

- Groupe de tâches : `SectionCard` — posé sur le canvas, séparé du groupe
  précédent par `border-t border-border/60` (`first:border-t-0`), jamais de
  fond ni d'ombre. Point de tonalité dans l'en-tête : rouge retard, accent
  aujourd'hui, neutre sinon ; compteur mono à droite.
- **Date implicite** (façon Things 3) : une section qui EST déjà un jour précis
  (Aujourd'hui, Demain) ne répète pas la date de chaque tâche — ce serait du
  bruit. La page passe `showDate={!section.dateImplied}` à `SectionBody`, qui le
  propage aux renderers (`SectionStyleProps.showDate`). En retard / À venir
  gardent la date (informative) ; Zoom / Stratigraphie l'ignorent (ils
  regroupent déjà par date). Le rappel (heure), lui, s'affiche toujours.
- **Styles de section : lisible au repos, signalé en permanence.** Une
  compression (Horizon, Loupe) garde TOUJOURS un état de repos déchiffrable —
  case + début de titre visibles (hauteur min ~24-26 px, plancher d'opacité
  ≥ 0.4 pour Horizon, ≥ 0.55 pour les titres de la Loupe) : un rang réduit à
  quelques pixels se lit comme un bug, pas comme une mise en forme. Et dès
  qu'un style ≠ « Liste » est actif, l'icône curseurs de l'en-tête reste
  affichée en `--brand` (tooltip « Mise en forme : {style} ») au lieu d'être
  révélée au survol — sans ce repère, l'utilisateur ne peut pas savoir
  pourquoi sa section change de forme.
- Hero du planner : `HeroDay` — date à gauche, widget progression à droite,
  le tout posé sur le canvas et clos par `border-b border-border/60`.
- Réglages : `SettingsGroup` (hairlines `divide-y`, pas de fond) +
  `SettingsRow` (pastille d'icône **mate** : `bg-{couleur}-500/8
  text-{couleur}-600 dark:text-{couleur}-400` — standard validé ; la ligne
  Accent utilise `bg-brand-soft text-brand`).
- Segmented controls : conteneur `bg-foreground/[0.05] p-[3px] rounded-xl`,
  pouce `bg-card` + ombre de contact (layoutId). Variantes « verre » pour
  Réglages : `ThemeSetting`, `NavSetting`.

### 4.4 Toujours utiliser les composants shadcn installés

Tooltip (tout bouton-icône), ContextMenu (clic droit sur une tâche),
AlertDialog (suppressions définitives), Empty (états vides, media en
`bg-brand-soft text-brand`), Skeleton (chargements, en dégradé d'opacité),
Switch, Badge, ScrollArea, Kbd, Input/Textarea, Spinner (boutons en attente,
`data-icon="inline-start"`). Le `TooltipProvider` global vit dans
`app/layout.tsx`.

**Conversation** (`Message` / `Bubble`, ajoutés le 2026-08-25) : primitives du
template shadcn/chatbot, reprises pour l'Assistant. `Message` est un portage
tel quel (que des `div`) ; `Bubble` est retaillé — le `render`/`useRender` de
Base UI retiré (notre pile est Radix) et la table de variantes ramenée à deux
entrées, `brand` (lavis `--brand-soft`, la question) et `ghost`, parce que
celles du registre peignent avec `--primary` et des `oklch(from …)` en dur
(§2.1/§2.2). La réponse de l'agent est posée à plat dans le `MessageContent`,
sans bulle (§2.5). Ne pas importer `@shadcn/react` ni `@base-ui/react` pour en
ramener le reste : deux piles de primitives se paieraient comme les deux
copies de Radix ci-dessous.

**Radix : uniquement le paquet unifié `radix-ui`** — jamais les paquets
fragmentés `@radix-ui/react-*` (retirés du projet le 2026-07-12). Deux copies
de Radix = deux piles de `FocusScope` distinctes : un Popover modal ouvert
dans un Dialog/Sheet ne met alors jamais en pause le FocusScope du dialog, qui
« vole » le focus de tout champ du popover (bug réel : champ « Nouvelle
liste… » du formulaire de détail insaisissable). Corollaire : tout Popover
rendu DANS un Dialog/Sheet doit être `modal` (voir `TodoDetailSheet`,
prop `modal` de `ListControl`), et son contenu haut (calendrier…) doit se
borner à `max-h-[var(--radix-popover-content-available-height)]` +
`overflow-y-auto` pour les petites fenêtres.

### 4.5 Écriture (UX copy)

Français, sentence case, verbes actifs (« Capturer une tâche… », « Exporter »).
Les erreurs disent quoi faire, sans s'excuser. Un même geste garde le même nom
de bout en bout (bouton « Supprimer » → toast « Supprimé »). Jamais de
direction dans le texte (« ci-dessus », « à gauche ») : la disposition change
avec la navigation.

**Vous partout, tu dans le Journal.** L'app vouvoie. Le Journal tutoie : c'est
un carnet personnel qui parle à son auteur (« Cette page t'attend »), une voix
voulue, pas un oubli. Ne pas l'étendre au reste, ni l'en retirer.

### 4.6 Ligne de tâche et formulaire de détail

- **Ligne de tâche** (`TodoItem`) : purement d'affichage — case à cocher, titre,
  note, ligne méta (`TodoMetaLine`). Sa structure ne dépend JAMAIS de
  l'interaction (survol, édition) : c'est la condition pour que le glissement
  `layout` des voisines soit fluide. Seul le bouton supprimer se révèle au
  survol (opacité, `pointer-events-none` tant qu'invisible → pas de saut). **Ne
  jamais réintroduire de contrôle d'édition monté/démonté dans la ligne.**
- **Ligne méta** (`TodoMetaLine`) : affichage seul, façon Things 3 — date
  discrète (masquée si implicite, voir §4.3), liste en pastille mate
  `bg-foreground/[0.06] rounded-full`, récurrence et rappel en icône + texte.
  Montée dès qu'une donnée existe, jamais au survol.
- **Édition** (`TodoDetailSheet`) : toute modification passe par un panneau
  latéral shadcn (`Sheet`), ouvert au clic sur la ligne ou via « Modifier… » du
  menu contextuel — jamais en éditant la ligne en place. Padding : `SheetContent`
  remis à plat (`p-0 gap-0`), chaque bande (en-tête, corps défilant, pied de
  suppression) gère son propre `px-5` et est close par une hairline ; titre,
  note, priorité et attributs partagent un unique rail vertical. Titre/note =
  `textarea` `field-sizing-content` sans bordure ni padding propres (alignés sur
  le rail). Priorité = segmented à pastille de couleur ; attributs = lignes
  icône + libellé + contrôle, valeurs alignées à droite.

### 4.7 États vides (`components/todo/EmptyHint.tsx`)

L'état vide s'écrit, comme la page blanche du Journal :

- **Une phrase posée là où serait la première ligne**, alignée à gauche sur le
  texte des lignes voisines. `EmptyHint` reprend le gabarit d'une ligne de
  tâche (`px-3 py-2.5`, colonne de case de 18 px, `gap-3`). Jamais de bloc
  centré, de pastille d'icône ni de titre gras.
- **Elle dit ce qui viendra ici**, pas « X vide » (le nom de la vue est déjà
  dans le rail). Ex. : « Tout est trié. Ce que vous capturez sans date ni
  projet attend ici. »
- **« Jamais commencé » ≠ « tout est fait ».** Seul le second porte une coche
  (la coche d'une tâche terminée, accent, qui se trace) : `done`. Aujourd'hui
  vidé par les coches dit « Tout est fait pour aujourd'hui. » et compte les
  tâches terminées.
- **Une action seulement si rien à l'écran ne la propose déjà** : un lien
  texte qui fait la chose (`action`). Sous la rangée de capture, pas
  de lien « Capturer » : la rangée se nomme elle-même.
- **Une seule voix par absence** : un panneau secondaire vide se tait quand
  la liste voisine parle déjà.
- **Rien autour ne la contredit** : un projet sans tâche ne montre ni anneau
  « 0 / 0 » ni « Terminer le projet ».

Exception : l'accueil de l'Assistant n'est pas un état vide de liste mais un
écran d'amorce (salutation + suggestions) ; il garde sa mise en scène.

## 5. Personnalisation (`components/ui-prefs.tsx`)

`useUIPrefs()` → `{ accent, setAccent, nav, setNav }`. Stockage
`localStorage` (`listik.accent`, `listik.nav`) — frontend uniquement, aucun
aller-retour Rust. Appliqué dès le montage ; défauts : `teal` + `dock`.

## 6. Checklist nouvelle surface

1. Canvas `bg-background`, contenu posé directement dessus — grouper avec
   `border-t`/`divide-y border-border/60`, jamais avec une carte élevée.
2. Couleur vive ? → `--brand` / `--brand-soft` uniquement.
3. Chiffre qui change ? → `AnimatedNumber` + `font-mono tabular-nums`.
4. Groupe d'options ? → `Segmented` : compact, à la taille de son contenu,
   pouce à plat (`bg-card` + ombre de contact), ressort `snappy`. Jamais de
   rail pleine largeur, de reflet « verre » ni de rebond.
5. Réglage ? → une ligne `SettingsRow` dans un `SettingsGroup` (libellé et
   phrase à gauche, contrôle compact à droite, hairlines). Interrupteur : le
   `Switch` fin (28 × 16), accent quand il est activé.
6. Bouton-icône ? → Tooltip. Destructif ? → AlertDialog.
7. Entrée à l'écran ? → `spring.smooth` (+ cascade si plusieurs).
8. Vide ? → `EmptyHint` (§4.7). Chargement ? → Skeleton.
