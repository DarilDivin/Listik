const repository = "DarilDivin/Listik";
const root = document.documentElement;

/* Thème : suit le système, sauf choix explicite mémorisé (clé listik-site-theme). */
const themeToggle = document.querySelector("#theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function isDark() {
  if (root.dataset.theme === "dark") return true;
  if (root.dataset.theme === "light") return false;
  return prefersDark.matches;
}

function syncTheme() {
  const dark = isDark();
  themeToggle.setAttribute("aria-label", dark ? "Passer en mode clair" : "Passer en mode sombre");
  themeColor.setAttribute("content", dark ? "#141918" : "#f7f4ec");
}

themeToggle.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("listik-site-theme", next); } catch (_) {}
  syncTheme();
});
prefersDark.addEventListener("change", syncTheme);
syncTheme();

/* Couleur de la goutte : la page s'ouvre en encre ; le visiteur peut essayer les six accents de l'app.
   Les valeurs suivent le thème, comme dans l'app (versions claires et sombres). */
const accents = {
  teal: ["#008687", "#39bab4"],
  indigo: ["#5366ce", "#8696f5"],
  violet: ["#8851d1", "#b88af7"],
  coral: ["#d4614c", "#f2846b"],
  amber: ["#be8628", "#e3ad4b"],
  rose: ["#ce4684", "#ed79a4"],
};
let currentAccent = "";

function applyAccent() {
  const pair = accents[currentAccent];
  if (pair) root.style.setProperty("--drop", isDark() ? pair[1] : pair[0]);
  else root.style.removeProperty("--drop");
}

document.querySelectorAll("[data-accent]").forEach((button) => {
  button.addEventListener("click", () => {
    currentAccent = button.dataset.accent;
    document.querySelectorAll("[data-accent]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    applyAccent();
  });
});
themeToggle.addEventListener("click", applyAccent);
prefersDark.addEventListener("change", applyAccent);

/* Démonstration de la saisie : le texte se tape, chaque élément reconnu s'allume.
   Sans JavaScript (ou sans animation), l'état final reste affiché. */
const demo = document.querySelector(".demo");
const demoText = document.querySelector("#demo-text");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function demoParts() {
  return Array.from(demoText.childNodes).map((node) => ({
    text: node.textContent,
    tok: node.nodeType === 1 ? node.dataset.tok : null,
    className: node.nodeType === 1 ? node.className : "",
  }));
}

const parts = demoParts();
let demoRunning = false;

async function playDemo() {
  if (demoRunning || reduceMotion.matches) return;
  demoRunning = true;
  demo.classList.add("is-typing");
  demo.querySelectorAll("[data-tok]").forEach((el) => el.classList.remove("is-on"));
  demoText.replaceChildren();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const part of parts) {
    let target = demoText;
    if (part.tok) {
      target = document.createElement("mark");
      target.className = part.className;
      target.dataset.tok = part.tok;
      demoText.append(target);
    }
    for (const char of part.text) {
      target.append(char);
      await wait(char === " " ? 70 : 48 + Math.random() * 46);
    }
    if (part.tok) {
      target.classList.add("is-on");
      demo.querySelector(`.parsed [data-tok="${part.tok}"]`)?.classList.add("is-on");
      await wait(260);
    }
  }
  await wait(1200);
  demo.classList.remove("is-typing");
  demoRunning = false;
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) { void playDemo(); observer.disconnect(); }
  }, { threshold: 0.5 });
  observer.observe(demo);
}
demo.addEventListener("click", () => void playDemo());

/* Dernière version : lien direct vers l'installateur, sinon le paquet .msi, sinon la page GitHub.
   La version Mac n'apparaît que si la dernière version contient vraiment un .dmg. */
const downloadLinks = document.querySelectorAll("[data-download-link]");
const isMacVisitor = /Macintosh|Mac OS X/.test(navigator.userAgent) && !/iPhone|iPad/.test(navigator.userAgent);

function show(selector, visible) {
  document.querySelectorAll(selector).forEach((el) => { el.hidden = !visible; });
}
const msiLinks = document.querySelectorAll("[data-msi-link]");
const releaseStatus = document.querySelector("#release-status");

function formatSize(bytes) {
  return `${(bytes / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

async function showLatestRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GitHub: ${response.status}`);

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const setup = assets.find((asset) => /-setup\.exe$/i.test(asset.name));
    const msi = assets.find((asset) => /\.msi$/i.test(asset.name));
    const installer = setup ?? msi;
    const dmg = assets.find((asset) => /\.dmg$/i.test(asset.name));
    const releaseUrl = release.html_url || `https://github.com/${repository}/releases/latest`;
    const version = (release.tag_name || release.name || "").replace(/^v/i, "");

    const forMac = Boolean(dmg) && isMacVisitor;
    const primary = forMac ? dmg : installer;

    downloadLinks.forEach((link) => { link.href = primary?.browser_download_url || releaseUrl; });
    msiLinks.forEach((link) => { link.href = msi?.browser_download_url || releaseUrl; });
    document.querySelectorAll("[data-version]").forEach((el) => { if (version) el.textContent = `Version ${version}`; });
    releaseStatus.textContent = primary
      ? `Version ${version} · ${forMac ? "version d’essai pour Mac" : "installateur Windows"} · ${formatSize(primary.size)}`
      : `Version ${version} · voir les fichiers sur GitHub`;

    if (dmg) {
      show("[data-mac-faq]", true);
      document.querySelectorAll("[data-win-only]").forEach((el) => { if (el.closest("details")) el.hidden = true; });
      // L'autre système, en lien discret sous le bouton.
      const other = forMac ? installer : dmg;
      document.querySelectorAll("[data-other-os-link]").forEach((link) => {
        link.href = other?.browser_download_url || releaseUrl;
        link.textContent = forMac ? "Aussi pour Windows" : "Aussi pour Mac (version d’essai)";
      });
      show("[data-other-os]", true);
    }
    if (forMac) {
      document.querySelectorAll("[data-os-label]").forEach((el) => { el.textContent = "Mac"; });
      // Le raccourci de capture du Mac (voir src-tauri/src/main.rs).
      document.querySelectorAll("[data-shortcut]").forEach((el) => { el.textContent = "⌥ Espace"; });
      document.querySelectorAll("[data-shortcut-mod]").forEach((el) => { el.textContent = "⌥"; });
      document.querySelectorAll("[data-shortcut-key]").forEach((el) => { el.textContent = "Espace"; });
      document.querySelectorAll(".i-win").forEach((el) => { el.style.display = "none"; });
      show("[data-win-only]", false);
      show("[data-mac-only]", true);
    }
  } catch {
    releaseStatus.textContent = "Voir la dernière version disponible sur GitHub.";
  }
}

void showLatestRelease();
