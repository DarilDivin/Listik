# Nouveautés de Listik

<!--
Source unique des notes de version. Elle alimente :
- la page https://listik.daril.fr/nouveautes/ (générée à la publication du site) ;
- les notes de chaque version sur GitHub, et la notification de mise à jour dans l'app.

Règles :
- Une section par version : « ## X.Y.Z — AAAA-MM-JJ ». Sans date, la version est « à paraître » :
  elle n'apparaît pas sur le site, et la publication d'une version refuse un tag dont la section n'est pas datée.
- La ligne « > … » juste sous le titre est le résumé : une phrase, montrée dans la notification de mise à jour.
- Puis trois rubriques au plus, dans cet ordre : « ### Nouveau », « ### Amélioré », « ### Corrigé ».
- Écrire pour les utilisateurs : ce qui change pour eux, en français, au vouvoiement. Pas de nom de fichier ni de jargon.
-->

## 0.2.2 — 2026-10-07

> Un panneau dans la zone de notification, des réglages plus clairs, et une série de corrections de sécurité.

### Nouveau

- Un clic sur l'icône de Listik, dans la zone de notification, ouvre un panneau : les tâches du jour à cocher, la capture rapide (tâche, journal, question) et l'accès à l'app. Le clic droit garde un menu court.

### Amélioré

- Les réglages sont réorganisés en lignes, avec des contrôles plus discrets.
- Quand une liste est vide, Listik dit ce qui viendra s'y ranger. Quand vous avez tout bouclé, il vous le dit aussi.
- Le compteur du jour compte tout ce que vous avez bouclé aujourd'hui, y compris les tâches en retard et les routines.
- Listik reste rapide avec un long historique de tâches.
- L'installateur Windows porte le logo de Listik et parle français.

### Corrigé

- Le logo de l'écran d'ouverture ne réapparaît plus une fraction de seconde après l'ouverture.
- Un lien dans une réponse de l'assistant s'ouvre dans votre navigateur, au lieu de remplacer Listik.
- La restauration d'une sauvegarde vérifie les fichiers qu'elle contient avant de les copier.
- Votre clé Groq n'est plus copiée dans les sauvegardes.
- Sous Windows, OpenCode répond aux vraies questions : seul le test de connexion fonctionnait.
- L'assistant ne peut plus supprimer de tâche ni réécrire votre journal : il peut seulement y ajouter.
- Sous Windows, l'assistant n'ouvre plus une fenêtre de terminal à chaque utilisation.
- « Ouvrir Listik », depuis la zone de notification, rouvre aussi une fenêtre réduite.
- Les réglages affichent la bonne version de Listik.

## 0.2.1 — 2026-10-04

> Corrige un plantage au démarrage.

### Corrigé

- Sur certains ordinateurs, Listik se fermait dès le lancement après la mise à jour vers la 0.2.0, à cause de l'ouverture de sa base de données.

## 0.2.0 — 2026-10-04

> Listik devient L!stik : une nouvelle identité, un accueil au premier lancement, et une version d'essai pour Mac.

### Nouveau

- Une nouvelle identité : le logotype L!stik, dont le i est une plume.
- Un accueil au premier lancement vous apprend la capture rapide (Alt+Q) et vous laisse choisir votre couleur et votre navigation.
- Le logo s'anime à l'ouverture de l'app.
- Une version d'essai pour Mac (macOS 13.3 ou plus récent), pas encore notarisée par Apple.

### Corrigé

- Le journal pouvait effacer des entrées d'une journée qui n'était pas affichée.
- Un « ! » isolé, qui marque la priorité, n'apparaît plus dans le titre de la tâche.

## 0.1.0 — 2026-09-23

> La première version publique de Listik.

### Nouveau

- La capture rapide : Alt+Q, depuis n'importe quelle application, pour noter une tâche, une entrée de journal ou une question.
- Un planificateur : Aujourd'hui, À venir, Quand je peux, Un jour, avec projets, domaines, tâches récurrentes et rappels.
- Un journal au jour le jour, avec photos, documents, PDF et notes vocales.
- Un assistant optionnel, branché sur l'outil que vous avez déjà : Claude Code, Codex, Antigravity ou OpenCode.
- Vos données restent sur votre ordinateur. Les réglages permettent de les sauvegarder et de les restaurer.
- Les mises à jour sont signées, et proposées au démarrage.
