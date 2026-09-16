---
name: debug-listik
description: Launch the Listik Tauri app with WebView2 remote debugging enabled, then screenshot it, read its DOM, click, and type into it via CDP (playwright-core) — without a separate browser and without losing Tauri IPC. Use whenever a UI change needs to be seen and driven, not just type-checked and tested.
---

# Déboguer Listik en conditions réelles

Listik est une app Tauri : `pnpm dev` seul sert `http://localhost:3000` mais
`window.__TAURI__` n'existe pas dans un navigateur classique, donc toute
commande IPC (créer une tâche, etc.) y échoue silencieusement. Il faut la
vraie fenêtre WebView2 — et WebView2 est du Chromium, donc pilotable par CDP
(Chrome DevTools Protocol) exactement comme un Chrome normal.

## 1. Lancer avec le port de debug ouvert

D'abord, vérifier qu'aucune instance précédente ne traîne — **`TaskStop` sur
`pnpm tauri dev` ne tue pas toujours `app.exe`/`cargo.exe`/`msedgewebview2.exe`
sous Windows**, ils survivent comme orphelins et bloquent le port 3000 :

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'app\.exe|cargo\.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'listik') } | Select-Object ProcessId, Name
```

S'il y en a, les tuer par PID avec `Stop-Process -Id <id> -Force` (tuer
`app.exe` d'abord suffit générally : ça entraîne toute sa descendance
WebView2/cargo avec lui). Ne jamais tuer au hasard par nom seul —
`msedgewebview2.exe` est utilisé par d'autres apps sur la machine ; filtrer
sur `CommandLine -match 'listik'`.

Puis lancer (Bash, `run_in_background: true` — ça ne se termine jamais tant
que l'app tourne) :

```bash
cd /d/Projects/Tauri/listik
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev
```

Le premier `cargo` (re)compile : 30s à 2 min selon le cache. Attendre plutôt
que deviner — surveiller le fichier de sortie du process en arrière-plan
jusqu'à `Running \`target\debug\app.exe\`` ou une ligne `error`.

## 2. Vérifier que CDP répond

```bash
curl -s http://127.0.0.1:9222/json/list
```

Liste les pages ouvertes. Listik en a **toujours au moins deux** : `/`
(fenêtre principale, ce qu'on veut d'habitude) et `/quick` (la fenêtre
Alt+Q, préchargée et cachée en permanence — voir
[[quick-capture-window]]). Les deux contiennent la sous-chaîne `/` donc un
matching trop naïf sur `/` seul récupère souvent `/quick` au lieu de la
racine — le script ci-dessous le gère déjà (`endsWith` avant `includes`),
mais donner un `urlMatch` assez précis (`"3000/"` pas juste `"/"`) reste plus
sûr.

## 3. Piloter avec `scripts/debug-app.mjs`

`playwright-core` (devDependency, déjà installé) parle CDP nativement — pas
besoin d'un vrai Chrome, on se connecte à la fenêtre WebView2 déjà ouverte.

```bash
node scripts/debug-app.mjs list                                          # URLs des pages ouvertes
node scripts/debug-app.mjs screenshot "3000/" "$TEMP/out.png"            # capture -> lire avec l'outil Read (image)
node scripts/debug-app.mjs eval "3000/" "document.title"                 # JS dans la page, résultat en JSON
node scripts/debug-app.mjs html "3000/" ".ma-classe"                     # innerHTML d'un sélecteur
node scripts/debug-app.mjs click "3000/" "[contenteditable='true']"
node scripts/debug-app.mjs type "3000/" "[contenteditable='true']" "texte à taper"
node scripts/debug-app.mjs key "3000/" "Enter"                           # ou "Control+a", "Backspace", etc.
```

Après une capture, **toujours regarder l'image** avec l'outil `Read` — c'est
le seul moment où « voir la page » a un sens.

## Pièges rencontrés

- **`document.execCommand('selectAll'/'delete')` ne vide pas le champ.**
  L'éditeur (Lexical, `CaptureField`) gère son propre DOM et ignore les
  execCommand synthétiques. Pour vider un champ : `click` dessus, puis `key
  Control+a`, puis `key Backspace` — de vrais événements clavier, que Lexical
  voit.
- **Git Bash mange les arguments qui ressemblent à un chemin POSIX.**
  `type "..." "/"` devient silencieusement `"C:/Program Files/Git/"` avant
  même que Node ne le voie (MSYS path conversion). Préfixer la commande par
  `MSYS_NO_PATHCONV=1` dès qu'un argument commence par `/` (ou contient
  uniquement des caractères que MSYS pourrait interpréter comme un chemin).
- **Ne jamais appeler `browser.close()`** sur une connexion
  `connectOverCDP()` — `debug-app.mjs` ne le fait pas exprès (il sort par
  `process.exit()`, qui coupe juste le WebSocket). L'ambiguïté entre « fermer
  la connexion » et « fermer l'app » a changé entre versions de Playwright ;
  vu le risque (tuer la fenêtre de l'utilisateur), ne pas y toucher sans
  revérifier sur la version installée.
- **`TaskStop` ne suffit pas** pour arrêter proprement — voir §1. Vérifier
  avant de relancer, sinon le nouveau `pnpm tauri dev` échoue sur le port
  3000 déjà pris.
- **Quand les deux fenêtres finissent sur la même route**, un `urlMatch` ne
  peut plus les distinguer du tout (ça arrive : `/journal` ouvert des deux
  côtés pour comparer, une capture ratée qui laisse les deux sur la même
  page d'erreur…). Utiliser `@0`/`@1` (index dans l'ordre renvoyé par
  `list`) plutôt que deviner un fragment d'URL — cet ordre s'est révélé
  stable dans cette session (lié à l'ordre de création des fenêtres côté
  Tauri, pas à la navigation) : `@0` est systématiquement retombé sur la
  fenêtre quick, `@1` sur la principale. Vérifier une fois avec `eval "@0"
  "innerWidth"` (680 = quick, 1200 = principale) avant de s'y fier dans une
  nouvelle session — ce n'est pas une garantie de l'API, juste une
  observation répétée.
- **`goto` change l'URL qui sert à retrouver la page.** Le matching
  (`endsWith` puis `includes`) se fait sur l'URL *actuelle*, pas sur un nom
  stable — après un `goto` foireux (ex. l'argument mangé par MSYS, voir
  ci-dessus) la page atterrit sur `chrome-error://chromewebdata/` ou un
  `file://…`, et le prochain `urlMatch` qu'on tapait pour LA retrouver ne
  correspond plus plus à rien, ou pire, correspond par erreur à l'AUTRE
  fenêtre (`/` et `/quick` contiennent tous les deux `/`). Après un `goto`,
  toujours vérifier avec `list` que la bonne page a atterri au bon endroit
  avant d'enchaîner une capture ou un clic — ne pas supposer que le
  `urlMatch` d'avant décrit encore la page d'avant.

## Ce que ça ne remplace pas

CDP voit et pilote le DOM/JS de la page. Il ne voit pas le chrome natif de la
fenêtre (barre de titre, comportement OS du redimensionnement/focus) ni le
rendu final tel qu'un œil humain le percevrait (hors capture d'écran). Pour
un doute sur ces points-là, le dire explicitement plutôt que de laisser
croire que la vérification CDP les couvre.
