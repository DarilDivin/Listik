const repository = "DarilDivin/Listik";
const downloadLink = document.querySelector("#download-link");
const downloadDetail = document.querySelector("#download-detail");
const releaseStatus = document.querySelector("#release-status");

async function showLatestRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);

    const release = await response.json();
    const installer = release.assets.find((asset) => asset.name.toLowerCase().endsWith("-setup.exe"))
      ?? release.assets.find((asset) => asset.name.toLowerCase().endsWith(".msi"));

    if (installer) {
      downloadLink.href = installer.browser_download_url;
      downloadDetail.textContent = `${release.name || release.tag_name} • ${installer.name}`;
    }
    releaseStatus.textContent = `Dernière version publiée : ${release.name || release.tag_name}`;
  } catch {
    releaseStatus.textContent = "La page des versions reste disponible si aucune release n’est encore publiée.";
  }
}

void showLatestRelease();
