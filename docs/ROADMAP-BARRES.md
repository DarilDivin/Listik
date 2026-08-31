# Listik → Les barres de saisie — Feuille de route

> Chantier décidé le 2026-08-30, en fin de refonte du Journal. Il remplace le plan
> « 4 barres » ébauché en conversation le 2026-08-28 : celui-ci disait de séparer
> les barres et de retirer le `/`, mais ne disait pas ce qui prend sa place. La
> réponse est ici, et elle change la forme du chantier.

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
2. **`BarreJournal`** — une ligne, qui prolonge la **reprise en cours** du jour
   (`db::append_journal_entry`). Utilisée par la fenêtre rapide **seulement** :
   la page Journal n'a pas de barre, c'est un document.
3. **`BarreAssistant`** — la saisie d'une conversation : envoi, état occupé,
   historique au clavier. Utilisée par l'Assistant **et** par la fenêtre rapide.

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

## L'ordre

Chaque étape laisse l'app utilisable — aucune ne dépend de la suivante.

1. **Extraire `BarreTache`** de l'Omnibar, et brancher la rangée de capture
   dessus. Le planificateur ne connaît plus les modes. Rien ne change à l'écran :
   c'est la garantie que l'extraction est fidèle.
2. **Extraire `BarreAssistant`**, brancher la page Assistant. ⚠️ Cette page est
   du **travail non commité** de l'utilisateur : à faire avec lui, pas à sa
   place.
3. **Écrire `BarreJournal`** — la plus petite : une ligne, `appendEntry`.
4. **La fenêtre rapide** : coque qui héberge une barre, pastilles, et la
   métamorphose. C'est là qu'est le travail de design.
5. **Le mot devient pastille** — dernier, parce que les pastilles suffisent déjà
   à rendre le choix possible, et que c'est le seul endroit avec un risque de
   faux positif.
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
