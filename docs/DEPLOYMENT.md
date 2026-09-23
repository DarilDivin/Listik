# Déployer Listik

Ce dépôt publie une application Windows, une page de téléchargement et des
mises à jour signées. Les trois éléments utilisent GitHub, mais ont des rôles
différents :

- **GitHub Actions – Verify** exécute les tests et le contrôle TypeScript sur
  chaque pull request et sur `main`.
- **GitHub Releases** héberge les installateurs `.exe` et `.msi`, ainsi que le
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
   sera disponible à `https://darildivin.github.io/Listik/`.

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

3. Committez les fichiers de version, poussez `main`, puis créez et poussez le
   tag correspondant :

   ```powershell
   git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/tauri.conf.json
   git commit -m "release: v0.2.0"
   git push origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```

Le workflow **Publish release** construit les installateurs, les signe,
crée la release GitHub et y dépose `latest.json`. Au démarrage, Listik trouve
ce manifeste, vérifie la signature et propose l’installation de la nouvelle
version.

## Tester avant une publication publique

Installez l’installateur sur un autre compte Windows ou une machine virtuelle.
Vérifiez l’ouverture, les données existantes, la sauvegarde/restauration et le
parcours « une version plus récente est disponible ». Windows SmartScreen peut
afficher un avertissement tant que l’application n’est pas aussi signée avec
un certificat de signature de code : la signature Tauri protège les mises à
jour, mais ne remplace pas ce certificat de réputation Windows.
