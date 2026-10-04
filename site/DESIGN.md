# Site de téléchargement de Listik

Une seule page statique (`index.html`, `styles.css`, `app.js`), publiée sur GitHub Pages par `.github/workflows/pages.yml` à chaque envoi sur `main` qui touche `site/`. Toutes les adresses sont relatives (`./…`) : le site est servi sous `/Listik/`.

## Identité

Le logotype est « L!stik » : le i est une plume, la goutte d’encre fait le point d’exclamation. La charte complète est dans `brand/README.md`.

- **Encre et papier.** Listik n’a pas de couleur de marque : dans l’app, la couleur appartient à l’utilisateur. La page s’ouvre donc en monochrome.
- **La goutte, seule couleur possible.** Elle suit la variable `--drop` (l’encre par défaut). La section « La couleur, c’est vous qui la choisissez » laisse le visiteur essayer les six accents de l’app ; le choix n’est pas mémorisé.
- **Le logotype est intégré** dans `index.html` sous forme de `<symbol>` (`#logotype` sans fente ni trou, pour les petites tailles ; `#logotype-detail` pour le grand logo). Les lettres sont en `currentColor`, la goutte en `var(--drop)`.

## Couleurs

| Rôle | Clair | Sombre |
|---|---|---|
| Fond | `#f7f4ec` | `#141918` |
| Fond secondaire | `#efebe1` | `#1a201f` |
| Surface | `#fbfaf6` | `#1e2523` |
| Encre | `#1d2220` | `#f1eee6` |
| Texte courant | `#454c49` | `#c8cbc5` |
| Texte discret | `#6a706c` | `#969d99` |

Le thème suit le système. Le bouton du haut l’impose et le mémorise (`localStorage`, clé `listik-site-theme`).

La démonstration de saisie reprend les teintes de l’app pour les éléments reconnus (date `#3b82f6`, projet `#8b5cf6`, priorité `#ef4444`). Ce sont celles de la vraie saisie, pas des couleurs de marque.

## Typographie

- **Fraunces** (titres) : la police du logotype, en sous-ensemble latin, douceur 50, taille optique et graisse variables. Fichier `assets/fonts/fraunces.woff2`, licence `Fraunces-OFL.txt`.
- **DM Sans** (texte) : `assets/fonts/dm-sans.woff2`, licence `DM-Sans-OFL.txt`.

## Captures

Les images de `assets/shots/` sont de vraies captures de l’app, en clair et en sombre, prises avec le skill `debug-listik` sur une base remplie de données d’exemple (elles le disent sous l’image du héros). La page affiche la version qui correspond au thème courant. Pour les refaire : lancer l’app avec le port de débogage, la remplir, capturer à l’échelle 2 via `Page.captureScreenshot`, puis convertir en WebP 1600 px.

## Contrats de `app.js`

- `[data-download-link]` reçoit l’adresse de l’installateur `-setup.exe` de la dernière version, à défaut le `.msi`, à défaut la page GitHub. Pour un visiteur sur Mac, et seulement si la dernière version contient un `.dmg`, il reçoit le `.dmg` ; `[data-os-label]` passe alors de « Windows » à « Mac ».
- Version Mac : tant que la dernière version n’a pas de `.dmg`, la page reste celle de Windows. Avec un `.dmg`, `[data-other-os]` / `[data-other-os-link]` proposent l’autre système, `[data-mac-faq]` remplace la réponse « pas pour le moment », et pour un visiteur sur Mac, `[data-mac-only]` (configuration requise, encadré Gatekeeper) remplace `[data-win-only]`, et `[data-shortcut]`, `[data-shortcut-mod]`, `[data-shortcut-key]` passent d’Alt+Q à ⌥ Espace.
- `[data-msi-link]` reçoit le `.msi`.
- `#release-status` (`aria-live`) affiche la version et la taille ; `[data-version]` affiche la version.
- La démonstration de saisie se tape quand elle entre à l’écran. Sans JavaScript ou avec « réduire les animations », l’état final reste affiché.

## Règles

- Dire la vérité sur l’installation : l’installateur n’a pas de signature Authenticode, donc SmartScreen avertit ; l’app Mac n’est pas notarisée, donc Gatekeeper bloque la première ouverture. Seules les mises à jour sont signées.
- Pas de faux témoignages, pas de chiffres inventés.
- Éviter les tics décoratifs : étiquettes en petites capitales à chaque section, filets façon journal, numéros qui ne décrivent pas une séquence.
- Garder les mêmes points de rupture : 960 px (une colonne) et 560 px (téléphone).
