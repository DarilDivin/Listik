# Déployer Listik

Ce dépôt publie une application Windows (et une version d’essai pour macOS),
une page de téléchargement et des mises à jour signées. Les trois éléments utilisent GitHub, mais ont des rôles
différents :

- **GitHub Actions – Verify** exécute les tests et le contrôle TypeScript sur
  chaque pull request et chaque push, sous Windows et sous macOS. Le job macOS
  est le seul endroit où le code propre au Mac compile : il ne se compile pas
  depuis Windows.
- **GitHub Releases** héberge les installateurs `.exe` et `.msi`, le `.dmg`
  macOS (une seule app pour les Mac Intel et Apple Silicon), ainsi que le
  fichier `latest.json` consulté par l’application.
- **GitHub Pages** héberge le site de téléchargement dans le dossier `site/`.

## Comprendre la signature des mises à jour

Tauri refuse une mise à jour qui ne possède pas une signature valide. La clé
publique est intégrée dans `src-tauri/tauri.conf.json` : elle permet à Listik
de vérifier une release. La clé privée correspondante signe les installateurs
dans GitHub Actions. Elle ne doit jamais être ajoutée au dépôt, envoyée dans un
message ou publiée dans une issue.

La clé locale de cette installation est rangée dans
`%LOCALAPPDATA%\Listik\release`. Son mot de passe est chiffré pour le compte
Windows courant. Conservez une copie chiffrée de ces deux fichiers dans un
gestionnaire de secrets : perdre l’un des deux empêcherait de mettre à jour les
installations existantes.

## Préparer GitHub une seule fois

1. Installez [GitHub CLI](https://cli.github.com/) puis connectez-le :

   ```powershell
   gh auth login
   ```

2. Depuis la racine du projet, transmettez les secrets à ce seul dépôt :

   ```powershell
   .\scripts\publish-signing-secrets.ps1
   ```

   Le script ajoute `TAURI_SIGNING_PRIVATE_KEY` et
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` sans les afficher dans le terminal.

3. Sur GitHub, ouvrez **Settings → Pages**, sélectionnez **GitHub Actions**
   comme source, puis enregistrez. Après le prochain envoi sur `main`, le site
   sera disponible à `https://listik.daril.fr/`.

   Le sous-domaine : chez Gandi (DNS de daril.fr), un enregistrement `CNAME`
   `listik` vers `darildivin.github.io.` ; dans **Settings → Pages**, le domaine
   personnalisé `listik.daril.fr` et **Enforce HTTPS**. Pas de fichier `CNAME`
   dans `site/` : le site est publié par GitHub Actions. L'ancienne adresse
   `darildivin.github.io/Listik/` redirige vers le sous-domaine.

## Publier une version

1. Choisissez une version SemVer, par exemple `0.2.0`, puis alignez les trois
   manifestes :

   ```powershell
   .\scripts\bump-version.ps1 0.2.0
   ```

2. Vérifiez la version et, si nécessaire, fabriquez un installateur signé sur
   ce PC. Cette commande peut fonctionner pendant que `pnpm tauri dev` reste
   ouvert : les caches de release sont séparés.

   ```powershell
   pnpm check
   .\scripts\build-signed-release.ps1
   ```

3. Datez la section de la version dans `NOUVEAUTES.md` (`## 0.2.0` devient
   `## 0.2.0 — 2026-10-04`) et relisez-la : c’est ce que liront les
   utilisateurs. Le workflow de publication refuse un tag dont la section
   n’existe pas ou n’est pas datée. Pour vérifier avant :

   ```powershell
   node scripts/nouveautes.mjs check 0.2.0
   ```

4. Committez les fichiers de version, poussez `main`, puis créez et poussez le
   tag correspondant :

   ```powershell
   git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/tauri.conf.json NOUVEAUTES.md
   git commit -m "release: v0.2.0"
   git push origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```

Le workflow **Publish release** construit les installateurs Windows et macOS
(deux jobs indépendants : l’échec de l’un n’arrête pas l’autre), les signe,
crée la release GitHub et y dépose `latest.json`. Au démarrage, Listik trouve
ce manifeste, vérifie la signature et propose l’installation de la nouvelle
version.

Les notes viennent de `NOUVEAUTES.md` (`scripts/nouveautes.mjs`) :

- **La release GitHub** et **la notification de mise à jour** reçoivent le
  résumé de la version, avec un lien vers sa section sur le site.
- **La page https://listik.daril.fr/nouveautes/** est régénérée par
  **Publish download site** dès que `NOUVEAUTES.md` change sur `main` : la
  version datée y apparaît au moment du push.
- **La page n’est pas versionnée** (`site/nouveautes/` est ignoré). Pour la voir
  en local : `node scripts/nouveautes.mjs site`, puis servir `site/`.

## Tester avant une publication publique

Installez l’installateur sur un autre compte Windows ou une machine virtuelle.
Vérifiez l’ouverture, les données existantes, la sauvegarde/restauration et le
parcours « une version plus récente est disponible ». Windows SmartScreen peut
afficher un avertissement tant que l’application n’est pas aussi signée avec
un certificat de signature de code : la signature Tauri protège les mises à
jour, mais ne remplace pas ce certificat de réputation Windows.

## La version macOS

Elle est signée « ad hoc » seulement (`bundle.macOS.signingIdentity: "-"`) :
pas de compte Apple Developer, donc pas de notarisation. macOS bloque la
première ouverture ; la page de téléchargement explique le passage par
Réglages Système › Confidentialité et sécurité › Ouvrir quand même. Pour s’en
passer : un compte Apple Developer (99 $ par an), un certificat Developer ID et
les secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`,
`APPLE_PASSWORD` et `APPLE_TEAM_ID` dans le workflow de publication.

Ce qui diffère du Windows, et reste à éprouver sur un vrai Mac :

- la fenêtre garde ses pastilles natives (`tauri.macos.conf.json`) ; fermer la
  fenêtre la masque, un clic sur le Dock la rouvre ;
- le raccourci de capture est ⌥Espace (⌥Q taperait « œ ») ;
- l’icône de la barre des menus est une silhouette (`icons/tray-template.png`) ;
- l’écran d’ouverture animé est remplacé par le logo fixe (le moteur web du Mac
  ne lit pas la transparence des WebM) ;
- l’assistant lit le PATH du shell de connexion pour trouver `claude` ou
  `opencode`, et ouvre la connexion dans le Terminal ;
- `Info.plist` déclare l’usage du micro, sans quoi macOS ferme l’app à la
  première note vocale.

La page de téléchargement ne montre la version Mac que si la dernière release
contient un `.dmg`.
