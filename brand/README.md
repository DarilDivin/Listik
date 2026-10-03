# Identité de Listik

Le logotype s’écrit « L!stik » : le i est une plume, et la goutte d’encre qui en tombe fait le point d’exclamation. Dans le code, la documentation et l’interface, le nom s’écrit **Listik**. Le « ! » n’existe que dans le dessin du logotype.

## Fichiers

| Fichier | Usage |
|---|---|
| `listik-logotype.svg` | Logotype encre, sur fond clair |
| `listik-logotype-light.svg` | Logotype ivoire, sur fond sombre |
| `listik-icon.svg` | Icône d’app, à partir de 48 px |
| `listik-icon-small.svg` | Icône dessinée pour 16, 24 et 32 px : bec élargi, sans fente |
| `listik-icon-1024.png` | Source carrée pour `pnpm tauri icon` |

Les icônes de l’application (`src-tauri/icons/`), le favicon de l’app (`app/favicon.ico`) et ceux du site (`site/favicon.ico`, `site/assets/listik-icon.svg`, `site/assets/listik-icon-256.png`) sont générés à partir de ces fichiers. Le site intègre aussi le logotype directement dans `site/index.html`, pour que la goutte puisse changer de couleur. Les `.ico` contiennent la version petite taille pour 16, 24 et 32 px, et la version détaillée au-delà. Ne pas les regénérer avec `tauri icon` seul : il réduirait la grande image pour toutes les tailles.

## Couleurs

Listik n’a pas de couleur de marque. Dans l’app, la couleur appartient à l’utilisateur (six accents dans les Réglages). Le logo reste donc monochrome.

| Rôle | Valeur |
|---|---|
| Encre | `#1d2220` |
| Papier | `#f7f4ec` |
| Ivoire (logo sur fond sombre) | `#f4f1e8` |
| Plaque de l’icône | dégradé vertical `#252c2a` → `#151a19` |

Seule exception, dans l’app : la goutte peut prendre l’accent choisi (`--brand`). Le teal n’est qu’un des six accents, jamais une couleur de marque.

## Typographie

Le logotype vient de **Fraunces** (licence SIL OFL), réglée pour l’affichage : taille optique 144, douceur 50, graisse 500. Les lettres sont vectorisées : aucune police n’est nécessaire pour afficher les fichiers. Les espaces viennent du crénage de la police, puis sont ajustés autour de la plume.

## Règles

- Taille minimale du logotype : capitale de 12 px. En dessous, utiliser l’icône.
- Garder autour du logotype un espace libre au moins égal à la largeur de la goutte.
- Ne pas redessiner, déformer ou recolorer la plume ou la goutte séparément du reste.
- Ne pas poser le logotype encre sur un fond sombre : utiliser la version ivoire.
