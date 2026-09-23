const repository = "DarilDivin/Listik";
const downloadLinks = document.querySelectorAll("[data-download-link]");
const releaseStatus = document.querySelector("#release-status");
const themeToggle = document.querySelector("#theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');

const demoExamples = {
  task: {
    context: "CAPTURER UNE TÂCHE",
    first: "Préparer la réunion de vendredi",
    accent: "demain à 10 h",
    note: "La tâche attend dans votre planificateur.",
    input: "Préparer la réunion de vendredi",
  },
  journal: {
    context: "ÉCRIRE DANS LE JOURNAL",
    first: "Une idée à garder",
    accent: "pour plus tard.",
    note: "Une trace dans la page de votre journée.",
    input: "Une idée à garder pour plus tard",
  },
  assistant: {
    context: "POSER UNE QUESTION",
    first: "Qu’est-ce qui mérite",
    accent: "mon attention aujourd’hui ?",
    note: "Après connexion d’un CLI compatible dans les réglages.",
    input: "Qu’est-ce qui mérite mon attention ?",
  },
};

function setDemoMode(mode) {
  const example = demoExamples[mode];
  if (!example) return;

  document.querySelectorAll("[data-demo-mode]").forEach((button) => {
    const active = button.dataset.demoMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelector("#demo-context").textContent = example.context;
  document.querySelector("#demo-note").textContent = example.note;
  document.querySelector("#demo-input").textContent = example.input;

  const accent = document.createElement("span");
  accent.textContent = example.accent;
  document.querySelector("#demo-text").replaceChildren(document.createTextNode(`${example.first} `), accent);
}

document.querySelectorAll("[data-demo-mode]").forEach((button) => {
  button.addEventListener("click", () => setDemoMode(button.dataset.demoMode));
});

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle.textContent = dark ? "Mode clair" : "Mode sombre";
  themeToggle.setAttribute("aria-label", dark ? "Activer le mode clair" : "Activer le mode sombre");
  themeColor.setAttribute("content", dark ? "#18201f" : "#f2f1ed");
}

themeToggle.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("listik-site-theme", dark ? "dark" : "light"); } catch (_) {}
  updateThemeButton();
});
updateThemeButton();

async function showLatestRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GitHub: ${response.status}`);

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const installer = assets.find((asset) => /-setup\.exe$/i.test(asset.name))
      ?? assets.find((asset) => /\.msi$/i.test(asset.name));
    const releaseUrl = release.html_url || `https://github.com/${repository}/releases/latest`;

    downloadLinks.forEach((link) => { link.href = installer?.browser_download_url || releaseUrl; });
    releaseStatus.textContent = installer
      ? `Dernière version : ${release.name || release.tag_name} · installateur Windows`
      : `Dernière version : ${release.name || release.tag_name} · voir les fichiers sur GitHub`;
  } catch {
    releaseStatus.textContent = "Voir la dernière version disponible sur GitHub.";
  }
}

void showLatestRelease();
