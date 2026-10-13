// Faire partir un passage : le copier pour un message, ou l'enregistrer en
// PDF, en image ou en document Word.
//
// Tout part du même `Bloc[]` (`passage.ts`). La MISE EN PAGE se fait ici, dans
// le webview — il a les polices et sait rendre du texte. Rust ne fait que ce
// que la page ne peut pas faire seule (`src-tauri/src/passage.rs`).
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { enHtml, enTexte, nomDeFichier, piecesDe, type Bloc } from "./passage";

// ---------------------------------------------------------------------------
// Copier — pour un message.

/**
 * Copie le passage : le texte brut ET sa version mise en forme.
 *
 * L'application qui reçoit choisit : une messagerie prend le texte, un mail
 * ou Word gardent l'italique et les titres. Les images ne suivent pas — un
 * presse-papiers chargé de photos colle mal presque partout.
 */
export async function copier(blocs: Bloc[]): Promise<void> {
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([enTexte(blocs)], { type: "text/plain" }),
      "text/html": new Blob([enHtml(blocs)], { type: "text/html" }),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Les images du passage.

/** Le type MIME d'une image, lu dans ses premiers octets — pas dans son nom. */
function typeDe(o: Uint8Array): string | null {
  const debut = (...octets: number[]) => octets.every((b, i) => o[i] === b);
  const ascii = (de: number, a: number) => String.fromCharCode(...o.slice(de, a));
  if (debut(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (debut(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ascii(8, 12).startsWith("avi")) return "image/avif";
  return null;
}

/**
 * Les images que cite le passage, en URL `data:`.
 *
 * `data:` et non `blob:` : la CSP de l'app livrée permet ces images en
 * `img-src`, mais aucun `fetch` vers elles — et `html-to-image` refait
 * télécharger toute image qui n'est pas DÉJÀ une URL `data:`. Le serveur de
 * développement, plus permissif, ne l'aurait jamais montré.
 *
 * Une pièce qui n'est pas une image (PDF joint, note vocale, document), ou
 * dont le fichier a disparu, est simplement absente : elle ne paraîtra pas,
 * et le reste du passage part quand même.
 */
async function chargerImages(blocs: Bloc[]): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  for (const id of piecesDe(blocs)) {
    try {
      const octets = new Uint8Array(await invoke<ArrayBuffer>("lire_image_piece", { id }));
      const type = typeDe(octets);
      if (!type) continue;
      const url = await new Promise<string>((ok, ko) => {
        const lecteur = new FileReader();
        lecteur.onload = () => ok(lecteur.result as string);
        lecteur.onerror = () => ko(lecteur.error);
        lecteur.readAsDataURL(new Blob([octets], { type }));
      });
      images.set(id, url);
    } catch {
      // Pas une image, ou plus sur le disque : elle ne partira pas.
    }
  }
  return images;
}

/** Attend que le navigateur ait vraiment peint ce qu'on vient de poser. */
async function peint(racine: HTMLElement): Promise<void> {
  await Promise.all(
    [...racine.querySelectorAll("img")].map((img) => img.decode().catch(() => {})),
  );
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// ---------------------------------------------------------------------------
// PDF — la page imprimée par WebView2.

const ID_IMPRESSION = "impression-passage";

/**
 * Exporte le passage en PDF. `null` si le dialogue a été refermé.
 *
 * La feuille est posée dans `body`, invisible à l'écran et SEULE visible à
 * l'impression (`globals.css`, `#impression-passage`), puis WebView2 imprime
 * la page. Rend `false` quand c'est le dialogue d'impression du système qui
 * s'est ouvert (hors Windows) : on ne sait pas alors si un fichier a été
 * écrit.
 */
export async function exporterPdf(blocs: Bloc[]): Promise<boolean | null> {
  const chemin = await save({
    defaultPath: nomDeFichier(blocs, "pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!chemin) return null;

  // Une feuille laissée par une impression système précédente (voir plus bas).
  document.getElementById(ID_IMPRESSION)?.remove();
  const images = await chargerImages(blocs);
  const feuille = document.createElement("div");
  feuille.id = ID_IMPRESSION;
  feuille.className = "passage-feuille";
  feuille.lang = "fr";
  feuille.innerHTML = enHtml(blocs, images);
  document.body.appendChild(feuille);

  let dialogueOuvert = false;
  try {
    await peint(feuille);
    const ecrit = await invoke<boolean>("imprimer_passage", { chemin });
    dialogueOuvert = !ecrit;
    return ecrit;
  } finally {
    // Hors Windows, le dialogue d'impression est encore ouvert quand on
    // revient ici : retirer la feuille maintenant imprimerait une page
    // blanche. Elle reste, invisible, jusqu'au prochain export.
    if (!dialogueOuvert) feuille.remove();
  }
}

// ---------------------------------------------------------------------------
// Image — une ou plusieurs, au format d'une story.

/** Largeur d'une image, en pixels CSS. Rendue au double : 1080 px. */
const LARGEUR = 540;
/** Hauteur maximale d'une image : le 9:16 d'une story ou d'un statut. */
const HAUTEUR = 960;

/** Une ligne de la feuille (ou une image, insécable), en px depuis le haut du texte. */
export interface Ligne {
  haut: number;
  bas: number;
}

/**
 * Découpe une feuille en pages, ENTRE deux lignes.
 *
 * Couper entre deux blocs gâchait la moitié des pages : un paragraphe de
 * nouvelle fait souvent une demi-page, et le suivant ne tenait plus. Ici un
 * paragraphe continue sur la page suivante, comme dans un livre ; seule une
 * ligne — ou une image — ne se coupe jamais. Une image plus haute qu'une page
 * en occupe une à elle seule, et y est rognée plutôt que de tout bloquer.
 *
 * Rend, pour chaque page, la tranche de la feuille qu'elle montre.
 */
export function paginer(lignes: Ligne[], disponible: number): Ligne[] {
  const pages: Ligne[] = [];
  let i = 0;
  while (i < lignes.length) {
    const haut = lignes[i].haut;
    let bas = lignes[i].bas;
    let j = i + 1;
    while (j < lignes.length && lignes[j].bas - haut <= disponible) {
      bas = Math.max(bas, lignes[j].bas);
      j++;
    }
    pages.push({ haut, bas: Math.min(bas, haut + disponible) });
    i = j;
  }
  return pages;
}

/**
 * Les lignes telles que le navigateur les a composées : une boîte par ligne
 * de texte (les morceaux d'une même ligne fusionnent), une par image.
 */
function lignesDe(flux: HTMLElement): Ligne[] {
  const origine = flux.getBoundingClientRect().top;
  const boites: Ligne[] = [];
  const parcours = document.createTreeWalker(flux, NodeFilter.SHOW_TEXT);
  const portee = document.createRange();
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    portee.selectNodeContents(n);
    for (const r of portee.getClientRects()) {
      if (r.height > 0) boites.push({ haut: r.top - origine, bas: r.bottom - origine });
    }
  }
  for (const img of flux.querySelectorAll("img")) {
    const r = img.getBoundingClientRect();
    boites.push({ haut: r.top - origine, bas: r.bottom - origine });
  }
  boites.sort((x, y) => x.haut - y.haut);
  const lignes: Ligne[] = [];
  for (const b of boites) {
    const derniere = lignes[lignes.length - 1];
    // Même ligne : les boîtes se chevauchent (un mot en italique, un lien).
    if (derniere && b.haut < derniere.bas - 2) derniere.bas = Math.max(derniere.bas, b.bas);
    else lignes.push({ ...b });
  }
  return lignes;
}

/**
 * Une feuille au format de l'image : `fenetre` montre une tranche du `flux`.
 * La mesure et chaque page ont EXACTEMENT cette structure — sinon le texte ne
 * se composerait pas pareil, et les coupes tomberaient au milieu d'une ligne.
 */
function feuilleImage(html: string): { page: HTMLElement; fenetre: HTMLElement; flux: HTMLElement } {
  const page = document.createElement("div");
  page.className = "passage-feuille passage-image";
  page.lang = "fr";
  page.style.width = `${LARGEUR}px`;
  const fenetre = document.createElement("div");
  fenetre.className = "passage-fenetre";
  const flux = document.createElement("div");
  flux.className = "passage-flux";
  flux.innerHTML = html;
  fenetre.appendChild(flux);
  page.appendChild(fenetre);
  return { page, fenetre, flux };
}

async function ecrire(chemin: string, octets: Uint8Array | ArrayBuffer): Promise<void> {
  await invoke("ecrire_passage", octets, {
    headers: { chemin: encodeURIComponent(chemin) },
  });
}

/**
 * « Le phare.png » → « Le phare 02.png ». Sur deux chiffres dès qu'il y a
 * dix pages : sinon « 10 » se range avant « 2 » dans un dossier, et dans la
 * galerie du téléphone qui reçoit les images.
 */
export function numerote(chemin: string, n: number, total: number): string {
  const chiffres = String(total).length;
  return chemin.replace(/(\.png)$/i, ` ${String(n).padStart(chiffres, "0")}$1`);
}

/**
 * Exporte le passage en image(s) PNG. Rend le nombre d'images écrites, `null`
 * si le dialogue a été refermé.
 *
 * Un texte court tient en UNE image, à sa hauteur. Un texte plus long est
 * découpé en pages au format story (9:16), numérotées — c'est ainsi qu'un
 * texte se partage en images, et une image géante dépasserait de toute façon
 * ce qu'un canvas sait dessiner (~32 000 px), sans la moindre erreur.
 */
export async function exporterImages(blocs: Bloc[]): Promise<number | null> {
  const chemin = await save({
    defaultPath: nomDeFichier(blocs, "png"),
    filters: [{ name: "Image PNG", extensions: ["png"] }],
  });
  if (!chemin) return null;

  const { toBlob } = await import("html-to-image");
  const images = await chargerImages(blocs);
  const html = enHtml(blocs, images);
  // Hors de l'écran, mais RENDU : une feuille en `display: none` n'a aucune
  // mesure, et rien à dessiner.
  const scene = document.createElement("div");
  scene.className = "passage-scene";
  document.body.appendChild(scene);

  const dessiner = async (page: HTMLElement, cible: string) => {
    scene.appendChild(page);
    await peint(page);
    // `toBlob` et non `toPng` : relire une URL `data:` par `fetch` serait
    // bloqué par la CSP de l'app livrée (`connect-src`).
    const blob = await toBlob(page, { pixelRatio: 2, skipFonts: true, cacheBust: false });
    if (!blob) throw new Error("L'image n'a pas pu être dessinée.");
    await ecrire(cible, new Uint8Array(await blob.arrayBuffer()));
    page.remove();
  };

  try {
    // 1. Tout le texte, composé une fois à la largeur finale.
    const mesure = feuilleImage(html);
    scene.appendChild(mesure.page);
    await peint(mesure.page);
    if (mesure.page.getBoundingClientRect().height <= HAUTEUR) {
      mesure.page.remove();
      await dessiner(mesure.page, chemin);
      return 1;
    }
    const style = getComputedStyle(mesure.page);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    // La place du folio, en bas de chaque page.
    const tranches = paginer(lignesDe(mesure.flux), HAUTEUR - padding - 28);
    mesure.page.remove();

    // 2. Chaque page montre SA tranche du même texte, recomposé à l'identique.
    for (let p = 0; p < tranches.length; p++) {
      const { page, fenetre, flux } = feuilleImage(html);
      page.style.height = `${HAUTEUR}px`;
      page.dataset.folio = `${p + 1} / ${tranches.length}`;
      // La fenêtre s'arrête au bas de la dernière ligne entière : celle qui
      // suit, à moitié visible, est pour la page d'après.
      fenetre.style.height = `${tranches[p].bas - tranches[p].haut}px`;
      flux.style.marginTop = `${-tranches[p].haut}px`;
      await dessiner(page, numerote(chemin, p + 1, tranches.length));
    }
    return tranches.length;
  } finally {
    scene.remove();
  }
}

// ---------------------------------------------------------------------------
// Word.

/**
 * Exporte le passage en .docx. `false` si le dialogue a été refermé.
 *
 * Composé par Rust (`src-tauri/src/word.rs`) à partir des mêmes blocs ; les
 * photos y sont lues directement par leur identifiant.
 */
export async function exporterWord(blocs: Bloc[]): Promise<boolean> {
  const chemin = await save({
    defaultPath: nomDeFichier(blocs, "docx"),
    filters: [{ name: "Document Word", extensions: ["docx"] }],
  });
  if (!chemin) return false;
  await invoke("exporter_word", { chemin, blocs });
  return true;
}
