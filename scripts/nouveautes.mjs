#!/usr/bin/env node
// Les notes de version, écrites une fois dans NOUVEAUTES.md, servies partout.
//
//   node scripts/nouveautes.mjs site            → écrit site/nouveautes/index.html
//   node scripts/nouveautes.mjs notes 0.2.2     → affiche les notes de la version (GitHub, mise à jour)
//   node scripts/nouveautes.mjs check 0.2.2     → échoue si la version n'a pas de section datée
//
// Sans dépendance : il tourne aussi dans les publications GitHub (pages.yml, release.yml).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://listik.daril.fr";
const GROUPS = ["Nouveau", "Amélioré", "Corrigé"];

/** Lit NOUVEAUTES.md : une version par « ## X.Y.Z — AAAA-MM-JJ » (date absente = à paraître). */
export function parse(markdown) {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n");
  const releases = [];
  let release = null;
  let group = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const head = line.match(/^## (\d+\.\d+\.\d+)(?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s*$/);
    if (head) {
      release = { version: head[1], date: head[2] ?? null, summary: "", groups: [] };
      releases.push(release);
      group = null;
      continue;
    }
    if (!release) continue;
    if (line.startsWith("> ")) {
      release.summary = `${release.summary} ${line.slice(2)}`.trim();
    } else if (line.startsWith("### ")) {
      const title = line.slice(4).trim();
      if (!GROUPS.includes(title)) throw new Error(`${release.version} : rubrique inconnue « ${title} » (${GROUPS.join(", ")})`);
      group = { title, items: [] };
      release.groups.push(group);
    } else if (line.startsWith("- ")) {
      if (!group) throw new Error(`${release.version} : une ligne « - » hors de toute rubrique`);
      group.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(raw) && group?.items.length) {
      group.items[group.items.length - 1] += ` ${line.trim()}`; // suite d'une ligne
    }
  }
  for (const r of releases) {
    if (!r.summary) throw new Error(`${r.version} : il manque le résumé (« > … » sous le titre)`);
  }
  return releases;
}

function read() {
  return parse(readFileSync(join(ROOT, "NOUVEAUTES.md"), "utf8"));
}

function find(releases, version) {
  const release = releases.find((r) => r.version === version.replace(/^v/, ""));
  if (!release) throw new Error(`NOUVEAUTES.md n'a pas de section « ## ${version.replace(/^v/, "")} »`);
  return release;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const typo = (s) => escape(s).replace(/'/g, "’");

const longDate = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Notes d'une version pour GitHub et la notification de mise à jour : courtes, le détail vit sur le site. */
export function releaseNotes(release) {
  return [
    release.summary,
    "",
    `Toutes les nouveautés de la ${release.version} : ${SITE_URL}/nouveautes/#v${release.version}`,
    "",
    "Installateurs : .exe ou .msi pour Windows, .dmg pour macOS (version d’essai, non signée par Apple).",
  ].join("\n");
}

/** La page « Nouveautés » du site, versions publiées seulement, la plus récente d'abord. */
export function sitePage(releases, indexHtml) {
  const logotype = indexHtml.match(/<symbol id="logotype"[\s\S]*?<\/symbol>/)?.[0];
  if (!logotype) throw new Error("site/index.html : symbole #logotype introuvable");
  const published = releases.filter((r) => r.date);

  const articles = published
    .map((r) => {
      const groups = r.groups
        .map(
          (g) => `
          <h3>${typo(g.title)}</h3>
          <ul>
${g.items.map((item) => `            <li>${typo(item)}</li>`).join("\n")}
          </ul>`,
        )
        .join("");
      return `
        <article class="release" id="v${r.version}" aria-labelledby="titre-${r.version}">
          <header class="release-head">
            <h2 id="titre-${r.version}"><a href="#v${r.version}">Version ${r.version}</a></h2>
            <time datetime="${r.date}">${longDate(r.date)}</time>
          </header>
          <p class="release-summary">${typo(r.summary)}</p>${groups}
        </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nouveautés · Listik</title>
    <meta name="description" content="Ce qui change à chaque version de Listik : nouveautés, améliorations et corrections." />
    <meta name="theme-color" content="#f7f4ec" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Nouveautés · Listik" />
    <meta property="og:description" content="Ce qui change à chaque version de Listik." />
    <meta property="og:url" content="${SITE_URL}/nouveautes/" />
    <meta property="og:image" content="${SITE_URL}/assets/listik-icon-256.png" />
    <link rel="icon" href="../favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="../assets/listik-icon.svg" />
    <link rel="preload" href="../assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="../assets/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="../styles.css" />
    <script>
      try {
        var t = localStorage.getItem("listik-site-theme");
        if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
      } catch (_) {}
    </script>
  </head>
  <body>
    <!-- Page générée par scripts/nouveautes.mjs depuis NOUVEAUTES.md : ne pas la modifier à la main. -->
    <svg width="0" height="0" class="defs" aria-hidden="true" focusable="false">
      ${logotype}
    </svg>

    <a class="skip" href="#contenu">Aller au contenu</a>

    <header class="top">
      <a class="brand" href="../" aria-label="Listik, accueil">
        <svg class="logo" role="img" aria-label="Listik"><use href="#logotype" /></svg>
      </a>
      <nav class="nav" aria-label="Navigation principale">
        <a href="../#capture">La capture</a>
        <a href="../#planificateur">L’application</a>
        <a href="../#chez-vous">Vos données</a>
        <a href="./" aria-current="page">Nouveautés</a>
      </nav>
      <div class="top-actions">
        <button class="theme" id="theme-toggle" type="button" aria-label="Passer en mode sombre">
          <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
          <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
        </button>
        <a class="btn btn-small" data-download-link href="https://github.com/DarilDivin/Listik/releases/latest">Télécharger</a>
      </div>
    </header>

    <main id="contenu" class="notes">
      <section class="notes-head" aria-labelledby="titre">
        <h1 id="titre">Nouveautés</h1>
        <p class="lead">Ce qui change à chaque version. Listik vous propose les mises à jour au démarrage, et rien ne s’installe sans votre accord.</p>
      </section>
${articles}
    </main>

    <footer class="foot">
      <svg class="foot-logo" role="img" aria-label="Listik"><use href="#logotype" /></svg>
      <p>Conçu par <a href="https://daril.fr" target="_blank" rel="noopener noreferrer">Daril D.</a></p>
      <p class="foot-links"><a href="https://github.com/DarilDivin/Listik" target="_blank" rel="noopener noreferrer">GitHub</a><a href="./">Nouveautés</a><a href="https://github.com/DarilDivin/Listik/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Licence MIT</a></p>
    </footer>
    <script src="../app.js" defer></script>
  </body>
</html>
`;
}

function main([command, version]) {
  const releases = read();
  if (command === "site") {
    const index = readFileSync(join(ROOT, "site", "index.html"), "utf8");
    const dir = join(ROOT, "site", "nouveautes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), sitePage(releases, index));
    console.log(`site/nouveautes/index.html : ${releases.filter((r) => r.date).length} version(s) publiée(s)`);
  } else if (command === "notes" && version) {
    process.stdout.write(releaseNotes(find(releases, version)));
  } else if (command === "check" && version) {
    const release = find(releases, version);
    if (!release.date) throw new Error(`NOUVEAUTES.md : la ${release.version} n'est pas datée (« ## ${release.version} — AAAA-MM-JJ »)`);
    if (!release.groups.some((g) => g.items.length)) throw new Error(`NOUVEAUTES.md : la ${release.version} ne dit rien de ce qui change`);
    console.log(`NOUVEAUTES.md : la ${release.version} est prête (${release.date})`);
  } else {
    throw new Error("usage : nouveautes.mjs site | notes <version> | check <version>");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
