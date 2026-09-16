# Listik → Les barres de saisie — Feuille de route

> Chantier décidé le 2026-08-30, en fin de refonte du Journal. Il remplace le plan
> « 4 barres » ébauché en conversation le 2026-08-28 : celui-ci disait de séparer
> les barres et de retirer le `/`, mais ne disait pas ce qui prend sa place. La
> réponse est ici, et elle change la forme du chantier.

> **Mise à jour (2026-09-16)** — l'étape 4 (la métamorphose) a été maquettée
> avant d'être codée, dans l'artifact « La fenêtre rapide », en deux passes
> (2026-09-02 puis 2026-09-16). Trois choses en sont ressorties et dépassent ce
> que ce document dit encore plus bas : `BarreJournal` n'est plus une ligne mais
> une feuille courte, les étapes 4 et 5 se sont fondues en une seule (le jeton
> *est* la métamorphose, il n'y a pas d'état intermédiaire « pastille allumée »),
> et le mode Question gagne une phase que ce document ne décrivait pas du tout —
> voir « Décisions supplémentaires » plus bas. **Étape 1 FAITE** (2026-09-16,
> commit à suivre) : `BarreTache` extraite, `CaptureRow` branchée dessus.

## Le constat

L'Omnibar est **une seule barre à modes** (`task` / `note` / `ask`), choisie par
un préfixe `/xxx`. Trois surfaces l'utilisent :

| Surface | Fichier | Mode par défaut |
| --- | --- | --- |
| Rangée de capture du planificateur | `components/todo/CaptureRow.tsx` | `task` |
| Fenêtre rapide (Alt+Q) | `app/quick/page.tsx` | `task` |
| Assistant | `app/(app)/assistant/page.tsx` | `ask` |

Le problème n'est pas le `/`. C'est qu'**une barre à modes est une barre
générique** : elle ne peut pas porter à la fois les jetons date/projet/priorité
du planificateur et le fil de conversation de l'Assistant. Elle finit par ne
bien servir personne, et chaque particularité d'une page devient une exception
dans un composant de 742 lignes.

## Le principe

> **Les barres ne changent pas de mode. C'est la fenêtre rapide qui change de barre.**

Chaque page a **sa** barre, entière, sans compromis — elle n'a qu'un travail et
peut donc le faire bien. La fenêtre rapide est le seul endroit **sans page**,
donc sans contexte : c'est là, et seulement là, qu'on choisit. Et elle ne bascule
pas un mode : elle **devient** l'une des trois barres.

### Les trois barres

1. **`BarreTache`** — ce qu'est déjà la rangée de capture : éditeur Lexical,
   jetons cliquables (date, projet, priorité), analyse en langage naturel.
   Utilisée par le planificateur **et** par la fenêtre rapide.
2. **`BarreJournal`** — plus une ligne (dépassé, voir la mise à jour en tête de
   ce document) : une **feuille courte**, la reprise du jour au-dessus d'un
   champ qui la **prolonge** (`db::append_journal_entry`). Utilisée par la
   fenêtre rapide **seulement** : la page Journal n'a pas de barre, c'est un
   document.
3. **`BarreAssistant`** — la saisie d'une conversation : envoi, état occupé,
   historique au clavier. Utilisée par l'Assistant **et** par la fenêtre rapide
   — mais dans la fenêtre rapide seulement, envoyer une question **n'affiche
   pas un fil** : la barre se retire en une bulle de réflexion, puis s'ouvre en
   petite réponse. Détail en « Décisions supplémentaires ».

Aucune ne connaît les autres. `OmnibarMode` disparaît de leur vocabulaire.

## Comment on choisit, dans la fenêtre rapide

Deux chemins, qui mènent au même endroit.

**Les pastilles.** Trois pastilles sous le champ. On clique, la barre se
métamorphose. Rien à savoir, rien à deviner.

**Le mot devient la pastille.** On tape `tâche` en tête d'un champ vide : le mot
se **solidifie en pastille** et la barre se métamorphose. Retour arrière sur la
pastille la redéfait en mot, et on continue d'écrire comme si de rien n'était.

C'est l'idiome des jetons qui existe déjà (`features/omnibar/tokenize.ts`,
`components/omnibar/TokenNode.ts`) — on l'étend de l'attribut à l'**intention**.
Le `/` disparaît : il demandait d'apprendre une syntaxe pour atteindre quelque
chose qui peut simplement se montrer.

### Ce qui protège des faux positifs

« Journal de bord à finir » est une tâche qui commence par « Journal ». Trois
garde-fous, à tenir ensemble :

- seulement le **premier mot**, et seulement si le champ était **vide** ;
- seulement suivi d'une **espace** — tant qu'on écrit le mot, rien ne bouge ;
- **Retour arrière défait** la pastille et rend le mot. Le geste de réparation
  est le geste réflexe.

La transformation est visible et réversible : le coût d'une erreur est un Retour
arrière, pas un texte perdu.

## Ce qui est vraiment difficile

**La métamorphose.** Les trois barres n'ont ni la même hauteur ni les mêmes
contrôles. Animer le passage de l'une à l'autre est tout le travail de design de
ce chantier — et c'est aussi ce qui le rendra beau ou raté.

Un piège déjà rencontré et documenté (refonte Omnibar du 2026-08-24) : **`layout`
de motion applique un scale au conteneur, qui ÉCRASE le contenu** — scaleY 0.84
mesuré, texte déformé pendant toute la transition. Il avait fallu le retirer de
la variante inline. Une métamorphose entre trois gabarits différents marche donc
sur ce piège : il faut animer la **hauteur** et l'**opacité** des contrôles, pas
la boîte.

Vérification : mesurer le `scaleY` calculé pendant la transition, au CDP, avant
de déclarer que c'est joli.

**La coque de la fenêtre rapide (résolu 2026-09-16).** `app/quick/page.tsx`
redimensionne aujourd'hui la vraie fenêtre OS (`win.setSize` + `win.center()`),
et évite déjà de recentrer pendant qu'un popover est ouvert parce que ça
saute. Animer un `setSize` image par image jusqu'à une largeur de bulle
(~54px, contre `WINDOW_WIDTH = 680`) referait sauter la fenêtre en continu.
Choix retenu : une fenêtre transparente à **taille fixe**, posée sur la plus
grande des formes (la barre, 680px), et c'est la boîte À L'INTÉRIEUR qui
morphe en CSS — `anime()` (mesure avant/après, voir l'artifact) s'y porte tel
quel, et le recentrage disparaît puisque la fenêtre OS ne bouge plus. Coût :
le hit-testing de la zone invisible autour de la forme active.

## L'ordre

Chaque étape laisse l'app utilisable — aucune ne dépend de la suivante.

1. **✅ FAIT (2026-09-16) — Extraire `BarreTache`** de l'Omnibar, et brancher la
   rangée de capture dessus. Le planificateur ne connaît plus les modes.
   Presque rien n'a changé à l'écran — sauf un point assumé, pas un oubli :
   `CaptureRow` perd `/note` (elle l'offrait, aucun appelant ne le montrait).
   Voir « Décisions supplémentaires ».
2. **Extraire `BarreAssistant`**, brancher la page Assistant. ⚠️ Cette page est
   du **travail non commité** de l'utilisateur : à faire avec lui, pas à sa
   place. *(Le travail non commité a été committé le 2026-09-16 pour ne pas
   bloquer l'étape 1 dessus — l'extraction elle-même reste à faire avec lui.)*
3. **Écrire `BarreJournal`** — plus « la plus petite » (dépassé, voir mise à
   jour en tête de document) : une feuille courte, `appendEntry`.
4. **La fenêtre rapide** : coque qui héberge une barre, pastilles, et la
   métamorphose. C'est là qu'est le travail de design — largement fait dans
   l'artifact, reste à porter dans `app/quick/page.tsx` avec la coque à taille
   fixe décrite plus haut.
5. **Le mot devient pastille** — n'est plus une étape séparable de la 4 (voir
   mise à jour en tête de document) : dans l'artifact, choisir une pastille
   ET taper le mot font strictement le même geste, il n'existe pas d'état
   « pastille allumée » sans jeton. Les deux s'implémentent ensemble.
6. **Retirer l'Omnibar à modes** et le `/` : `OmnibarMode`, `useSlashCommands`,
   le menu slash. En dernier, quand plus rien n'en dépend — sinon on casse la
   fenêtre rapide et l'Assistant en attendant.

## Décisions prises

- **Les modes disparaissent**, parce qu'ils empêchent chaque page d'avoir ses
  particularités. C'est la raison, et elle doit rester lisible dans le code.
- **La fenêtre rapide garde les trois** — tâche, journal, question. Jeter une
  ligne au journal sans ouvrir l'app est ce qu'elle fait le mieux.
- **Le `/` est retiré**, remplacé par les pastilles et par le mot qui se
  solidifie. Pas conservé « pour les experts » : deux chemins pour la même chose,
  c'est deux choses à documenter et à maintenir.

## Décisions supplémentaires (artifact du 2026-09-02, revu le 2026-09-16)

Prises en maquettant l'étape 4 avant de l'écrire — elles amendent ce document,
qui restait sur l'état du 2026-08-30.

- **`BarreJournal` est une feuille, pas une ligne.** `JournalWidget` (l'accueil)
  prouvait déjà que « la même feuille, en plus court » marche — la version
  « une ligne » du 2026-08-30 était une proposition par défaut, pas un choix
  testé.
- **Le mode Question gagne une phase que ce document ne décrivait pas** :
  question envoyée → la barre se retire en **bulle de réflexion** (un cercle
  qui réutilise le filtre gooey des pastilles — trois gouttes qui dérivent au
  lieu de trois icônes qui se posent, même matière, autre histoire) → **petite
  réponse** (plus étroite que la barre, question en jeton, réponse à plat,
  relance en pied, bouton pour ouvrir l'Assistant). Une relance n'ouvre pas une
  nouvelle bulle : seule la première question fait tout le chemin.
- **La coque est une fenêtre à taille fixe** (voir « Ce qui est vraiment
  difficile ») — pas une fenêtre OS animée en continu.
- **Le blur ne ferme plus la fenêtre tant qu'une bulle ou une réponse est à
  l'écran.** Se pose dans le `onFocusChanged` de `app/quick/page.tsx`, à côté
  du `isOverlayOpen()` qui y existe déjà. Revient dès qu'on referme ou qu'on
  repart en question neutre. Échap reste le filet dans tous les cas.
- **La conversation ne continue pas dans l'Assistant.** Rien ne persiste une
  conversation aujourd'hui (le fil vit dans l'état local de `assistant/page.tsx`,
  pas en base) ; construire cette continuité serait un chantier à part que rien
  d'autre ne motive. Le bouton « ouvrir » transmet seulement la **dernière
  question posée**, pas tout l'échange.
- **`CaptureRow` perd `/note`.** Redondant avec le `JournalWidget`, toujours
  visible sur la même page (Aujourd'hui) — et cohérent avec « `BarreJournal`
  utilisée par la fenêtre rapide seulement ».
- **À vérifier avant de coder la bulle (pas encore fait)** : l'artifact simule
  ~1,5s de réflexion ; un vrai tour `ai_agent_run` (CLI Claude) tourne plutôt
  autour de **12s**. Une bulle de 54px sans bouton d'annulation pendant 12s
  n'est pas la même expérience que ce que l'artifact montre — et le bouton
  Stop du runbook IA (R6) n'a jamais été construit. À trancher avant l'étape 4
  côté Question, pas avant.

## Questions encore ouvertes

- La fenêtre rapide garde-t-elle sa **dernière barre** entre deux ouvertures, ou
  revient-elle toujours sur Tâche ? (Revenir sur Tâche est prévisible ; garder la
  dernière épouse l'habitude. À trancher en l'utilisant.)
- Le champ Lexical à jetons doit-il enfin **remplacer l'ancien champ** dans la
  fenêtre rapide ? Reporté le 2026-08-24 tant qu'il n'était pas éprouvé — il
  l'est maintenant, sur la rangée de capture.
- L'Assistant crée encore ses notes avec `createEntry` (bloc isolé) alors que la
  fenêtre rapide utilise `appendEntry` (prolonge la reprise). À aligner en même
  temps que l'étape 2.
