# Guide d'utilisation — Listik

Ce document liste toutes les fonctionnalités de Listik et explique comment les utiliser.
Listik est organisé en 4 sections accessibles depuis la barre latérale (ou le dock, selon
votre préférence de navigation) : **Planificateur**, **Journal**, **Assistant**, **Réglages**.

---

## 1. Capture rapide

Deux façons de capturer une tâche, une note ou une question, sans jamais quitter le clavier.

### La barre de saisie (Omnibar)

Présente en bas du Planificateur et de l'Assistant. C'est une seule barre « à modes » :

- **Mode Tâche** (par défaut dans le Planificateur) : tapez votre tâche en langage naturel.
- **Mode Note** : tapez `/note` (ou `/n`) pour basculer, écrivez, Entrée pour enregistrer —
  cela ajoute un **bloc de Journal pour aujourd'hui** (voir le Journal).
- **Mode Question** : tapez `/question` (ou `/q`, `/ask`, `/?`) pour poser une question à
  l'Assistant sans changer de page.
- Tapez `/` pour voir le menu des modes disponibles.

**Syntaxe reconnue en mode Tâche**, directement dans le texte :
| Écrivez | Effet |
|---|---|
| `demain`, `lundi prochain`, `dans 3 jours`, `15 mars`… | Date planifiée (compréhension du langage naturel, en français) |
| `#nom-du-projet` | Rattache la tâche à un projet (le crée s'il n'existe pas) |
| `@nomdutag` (un ou plusieurs) | Ajoute un ou plusieurs tags |
| `urgent`, `important`, `!!` | Priorité Haute détectée automatiquement |
| `!` ou `asap` | Priorité relevée |
| `texte // note` | Tout ce qui suit `//` devient la note de la tâche |

Ces éléments sont aussi éditables via les boutons qui apparaissent à droite de la barre
(date, priorité, projet) une fois que vous commencez à taper.

### La capture flottante (Alt+Q)

`Alt+Q` ouvre à tout moment une petite fenêtre de capture à la façon Spotlight, par-dessus
n'importe quelle application. Même barre, même syntaxe, pour noter une idée sans changer de
fenêtre. La `/note` y crée également un bloc de Journal pour le jour même.

---

## 2. Le Planificateur

### Le rail de navigation (à gauche)

Six vues, dans l'esprit GTD (Getting Things Done) :

- **Boîte de réception** — tout ce qui est capturé sans date ni projet atterrit ici. La
  planifier ou la rattacher à un projet l'en fait sortir.
- **Aujourd'hui** — la vue d'accueil. Les tâches du jour, découpées en sous-sections
  (voir plus bas), suivies d'un aperçu du Journal.
- **À venir** — tâches planifiées dans le futur.
- **Quand je peux** — tâches sans date, déjà triées (rattachées à un projet), prêtes à être
  reprises dès que vous avez du temps.
- **Un jour** — tâches mises de côté (« someday »), hors des horizons datés.
- **Historique** — tâches terminées, groupées par date.

Sous les vues, l'arbre **Domaines → Projets** : cliquez `+` pour créer un domaine ou un
projet, clic droit sur un projet pour le renommer, le dupliquer ou le supprimer. Un projet
affiche un anneau de progression (terminé / total) qui se remplit au fil des tâches
cochées ; « Terminer le projet » est disponible depuis sa page.

### La vue « Aujourd'hui »

La page d'accueil. Elle affiche, dans l'ordre :

- **En retard** — les tâches dont la date planifiée est passée (ou dont l'échéance est
  dépassée).
- **Aujourd'hui** — les tâches ponctuelles planifiées pour le jour.
- **Routines** — les tâches **récurrentes** planifiées pour le jour, regroupées à part
  (c'est l'endroit du geste répété : « méditation », « changer les draps », « promenade »…).
  Une routine manquée hier retombe dans « En retard » comme n'importe quelle tâche datée.
- **Ce soir** — les tâches marquées « Ce soir ».
- **Journal** — les blocs déjà écrits aujourd'hui + une zone d'ajout rapide, pour noter
  quelques lignes sans quitter l'accueil. « Ouvrir » mène à la page complète.

### Domaines & Projets

- Un **Projet** peut appartenir à un **Domaine**, ou vivre seul.
- Cliquer sur un projet ou un domaine dans le rail ouvre sa page : titre et note éditables,
  anneau de progression, liste de ses tâches.
- Une tâche datée reste visible à la fois dans son projet ET dans la vue temporelle qui
  correspond à sa date (Aujourd'hui, À venir…) — ce ne sont pas deux copies, juste deux
  façons de regarder la même tâche.

### Tags

Ajoutez des tags à la capture (`@nomdutag`) ou depuis le panneau de détail d'une tâche. Les
tags apparaissent en chips sur chaque tâche ; cliquer sur une chips filtre toute la vue
courante sur ce tag (bandeau de filtres en haut de la page).

### Dates : planifiée vs échéance

Deux dates distinctes et indépendantes, réglables dans le panneau de détail (cliquer sur une
tâche pour l'ouvrir) :

- **Planifiée** — quand vous comptez vous y mettre. C'est elle qui détermine la section
  (Aujourd'hui, À venir…).
- **Échéance** — la date limite réelle. Affiche un badge de compte à rebours (« J-3 », « J-0 »
  en rouge à l'approche) sur la ligne de la tâche, sans changer sa section tant que
  l'échéance n'est pas atteinte. Une fois l'échéance atteinte, la tâche remonte
  automatiquement dans Aujourd'hui.
- **Ce soir** — un interrupteur dans le détail de la tâche qui la fourre dans la sous-section
  du soir d'Aujourd'hui (l'activer sur une tâche non planifiée la planifie automatiquement
  pour aujourd'hui).

### Récurrence

Dans le panneau de détail, le champ **Répéter** propose :

- Jamais, tous les jours, jours ouvrés, toutes les semaines, tous les mois.
- **Toutes les N** (jours/semaines/mois) — ex. « toutes les 2 semaines ».
- **Positionnel mensuel** — « le 1er lundi du mois », « le dernier vendredi », « le dernier
  jour du mois ».
- **Base du report** : à date fixe (la prochaine occurrence est calculée depuis la date
  planifiée), ou **après complétion** (la prochaine occurrence part du jour où la tâche est
  réellement cochée — utile pour « changer les draps » plutôt que « payer le loyer »).

Une tâche récurrente reste une seule ligne : cocher la fait avancer à la prochaine
occurrence plutôt que la marquer terminée définitivement.

### Rappels

Dans le détail, **Rappel** ouvre un sélecteur date + heure indépendant de la planification —
un rappel ponctuel, à l'heure de votre choix, même sur une tâche non datée.

### Priorité

Trois niveaux (Basse / Normale / Haute), visibles par la couleur de l'anneau de la case à
cocher. Se règle depuis le détail ou le menu contextuel (clic droit → Priorité).

### Réordonner, planifier au clavier, sélectionner

- **Glisser-déposer** une tâche pour la réordonner dans une section, ou la déposer sur une
  vue du rail pour la replanifier (glisser vers *Demain* = replanifier pour demain).
- **Navigation clavier** : flèches ↑/↓ pour parcourir les tâches, Entrée/Espace pour ouvrir
  le détail, Suppr/Retour arrière pour supprimer, `t`/`d`/`s` pour planifier
  Aujourd'hui/Demain/Un jour, Alt+↑/↓ pour réordonner sans souris.
- **Multi-sélection** : Ctrl/Cmd-clic pour ajouter une tâche à la sélection, Maj-clic pour
  sélectionner une plage. Une barre d'actions apparaît (planifier, terminer, déplacer vers un
  projet, supprimer) — Échap pour désélectionner.

### Annuler

Chaque action réversible (cocher, replanifier, déplacer, supprimer, actions par lot) affiche
un toast « Annuler ». `Ctrl/Cmd+Z` rejoue le dernier « Annuler » disponible, même sans
cliquer le toast (sauf si vous êtes en train de taper dans un champ).

### Recherche (Quick Find)

`Ctrl+K` (ou `⌘K`) ouvre la palette de recherche : **tâches**, **projets**, **domaines** et
**tags**, en une seule liste groupée par type. La recherche des tâches est sémantique (elle
comprend le sens, pas seulement le mot exact) ; celle des projets/domaines/tags est
insensible aux accents. Cliquer un résultat vous y amène directement (pour une tâche, sa
branche s'ouvre avec le détail affiché).

### Dupliquer

Clic droit sur une tâche ou un projet → **Dupliquer**. Une tâche copiée garde son texte, ses
tags, ses sous-tâches en cours et sa règle de récurrence, mais repart avec un statut
« à faire » et sans dates. Un projet « copie » toutes ses tâches (y compris terminées,
remises à faire) sous un nom suffixé « (copie) ».

### Menu contextuel (clic droit sur une tâche)

Terminer/Rouvrir, Modifier…, Dupliquer, Aujourd'hui, Demain, Priorité (sous-menu), Supprimer.

---

## 3. Le Journal

Le Journal remplace les anciennes Notes : un carnet quotidien, un **bloc horodaté** par
pensée. Chaque jour est une **page** qui rassemble ses blocs, triés par heure d'écriture.

### Naviguer entre les jours

Les chevrons « précédent / suivant » en haut de page : quitter la page du jour puis
naviguer jusqu'à la date voulue. **Aller sur un jour puis écrire EST le mécanisme**
« une pensée écrite à l'avance » — pas de sélecteur de date séparé.

- Sur la page d'aujourd'hui, la section **À venir** liste les entrées écrites pour des jours
  futurs ; cliquer sur une entrée saute à sa page-jour.
- Une entrée écrite en avance porte, le jour venu, un badge « écrit le [date] » à côté de
  son heure au-dessus.

### Écrire et éditer

- Le champ en bas de page ajoute un bloc. Entrée envoie, Maj+Entrée fait un retour à la
  ligne.
- Le contenu est écrit en **Markdown** et rendu mis en forme au repos ; cliquer sur un bloc
  le repasse en édition (une sauvegarde au clic extérieur).
- Des tags peuvent être posés sur un bloc (survolé par la ligne pour voir les contrôles) ;
  ce sont les mêmes tags que les tâches.
- La suppression demande confirmation (elle est définitive, sans « Annuler »).

Sur l'accueil Aujourd'hui, l'**aperçu Journal** offre les mêmes actions sans changer de page.

---

## 4. L'Assistant (IA)

Chat en langage naturel (mode `/question` de l'Omnibar, ou directement sur la page
Assistant) :

- Poser une question sur vos tâches (recherche sémantique sous le capot, avec les sources
  affichées).
- **Créer** une tâche en une phrase (« ajoute une tâche pour appeler le plombier demain »).
- **Modifier** ou **supprimer** une tâche en la décrivant (« marque la tâche des impôts
  comme terminée ») — l'assistant la retrouve par le sens, pas par un identifiant exact ; en
  cas de correspondance trop incertaine, il répond qu'il n'a rien trouvé plutôt que d'agir
  au hasard.
- La conversation garde le contexte des derniers tours (« et demain ? » fonctionne).
- Les suppressions faites par l'assistant passent par les mêmes mutations que l'UI : le
  toast « Annuler » fonctionne aussi dessus.

---

## 5. Réglages

- **Couleur d'accent** — 6 teintes (Sarcelle, Indigo, Violet, Corail, Ambre, Rose), teint la
  progression, les sélections et les états actifs partout dans l'app.
- **Navigation** — Dock flottant d'icônes, ou barre latérale repliable (`Ctrl+B` pour la
  replier/déplier).
- **Thème** — Suit le système par défaut, avec les variantes Claire / Sombre / **Noir pur**
  (quasi noire, pour écrans OLED) dès que Sombre est actif.
- **Résumé quotidien** — une notification listant les tâches du jour, à une heure fixe que
  vous choisissez.
- **Capture rapide** — rappel du raccourci `Alt+Q`.
- **Sauvegarder mes données** — écrit **deux** choses à l'emplacement de votre choix
  (bouton « Exporter ») : un fichier JSON avec vos tâches, projets, domaines, rubriques,
  étiquettes, ordres manuels, tout le Journal et vos réglages ; et, à côté, un dossier
  `…-pieces` contenant vos pièces jointes — photos, documents, notes vocales. **Gardez les
  deux ensemble** : le JSON seul ne contient pas les fichiers.

  L'application vous dit ce qu'elle a emporté (« 128 tâches, 43 jours de journal,
  12 pièces ») et vous prévient si un fichier a disparu du disque. Cette sauvegarde ne se
  **relit pas** encore depuis l'application : c'est une archive, pas encore une
  restauration.

Les lignes affichées **« Bientôt »** signalent des fonctionnalités prévues mais pas encore
disponibles.

---

## 6. Récapitulatif des raccourcis clavier

| Raccourci | Effet |
|---|---|
| `Alt+Q` | Ouvrir la capture rapide flottante, depuis n'importe où |
| `Ctrl/⌘+K` | Recherche globale (tâches, projets, domaines, tags) |
| `Ctrl+B` | Replier/déplier la barre latérale (mode navigation « Barre latérale ») |
| `Ctrl/⌘+Z` | Annuler la dernière action réversible |
| `↑` / `↓` (sur une tâche) | Se déplacer d'une tâche à l'autre |
| `Entrée` / `Espace` (sur une tâche) | Ouvrir le détail |
| `Suppr` / `Retour arrière` (sur une tâche) | Supprimer la tâche |
| `t` / `d` / `s` (sur une tâche) | Planifier Aujourd'hui / Demain / Un jour |
| `Alt+↑` / `Alt+↓` (sur une tâche) | Réordonner sans souris |
| `Ctrl/⌘-clic` (sur une tâche) | Ajouter/retirer de la sélection |
| `Maj-clic` (sur une tâche) | Sélectionner une plage |
| `Échap` | Vider la sélection en cours |
| `/` (dans l'Omnibar) | Ouvrir le menu des modes (Tâche / Note / Question) |
| `//texte` (dans l'Omnibar, mode Tâche) | Ajouter `texte` comme note de la tâche |