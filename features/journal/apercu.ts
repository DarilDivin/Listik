/**
 * La première page d'un PDF, rendue en image.
 *
 * Pourquoi ici et pas en Rust : le rendu se fait UNE FOIS, à l'ajout. La
 * vignette est ensuite rangée à côté du fichier et l'affichage redevient une
 * simple image — pdf.js ne pèse donc sur rien d'autre que le geste d'attacher
 * un PDF, et c'est pour ça qu'il est chargé à la demande (`import()`), jamais
 * dans le lot principal. Un moteur de rendu côté Rust aurait embarqué une
 * bibliothèque native dans chaque livraison, pour le même résultat.
 *
 * Effet de bord heureux : l'export emporte alors une VRAIE image.
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { journalApi } from "./api";
import type { JournalPiece } from "./types";

/** Assez large pour rester net sur un écran dense, assez petit pour ne rien peser. */
const LARGEUR = 420;

export interface Apercu {
  /** Les octets d'un PNG. */
  octets: Uint8Array;
  /** Le nombre de pages du document — « 12 pages » sous le nom. */
  pages: number;
}

/**
 * Rend la première page de `octets`. Lève si le fichier n'est pas un PDF
 * lisible — un PDF protégé par mot de passe, par exemple : l'appelant retombe
 * alors sur la rangée nue, qui reste juste.
 */
export async function apercuDuPdf(octets: Uint8Array): Promise<Apercu> {
  const pdfjs = await import("pdfjs-dist");

  // Le worker est servi par le bundler, pas par un CDN : l'app est hors ligne
  // par nature. `new URL(..., import.meta.url)` est la forme que webpack et
  // Turbopack savent tous deux réécrire vers l'actif émis.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  // `getDocument` prend possession du tampon : on lui en donne une copie,
  // sinon les octets qu'on garde pour l'écriture du fichier sont détachés.
  //
  // On garde la TÂCHE, pas seulement le document : c'est elle qui porte
  // `destroy` — le document, lui, n'a que `cleanup`, et l'appeler à sa place
  // laisserait un worker vivant par PDF attaché.
  const tache = pdfjs.getDocument({ data: new Uint8Array(octets) });
  const doc = await tache.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: LARGEUR / base.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponible.");

    // Le fond BLANC est délibéré : une page de PDF est du papier, et un PDF
    // sans fond rendu sur un canvas transparent deviendrait illisible sur le
    // thème sombre.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Vignette illisible.");

    return { octets: new Uint8Array(await blob.arrayBuffer()), pages: doc.numPages };
  } finally {
    await tache.destroy();
  }
}

/**
 * Les pièces déjà tentées dans cette session.
 *
 * Un PDF protégé par mot de passe ne se rendra jamais : sans ce garde, on
 * relancerait le rendu à chaque affichage de la journée, en boucle.
 */
const tentees = new Set<string>();

/**
 * S'assure qu'un PDF a sa vignette, et la rend si elle manque.
 *
 * Déclenché à l'AFFICHAGE, et non au moment d'attacher — c'est ce qui rend la
 * chose RÉPARABLE. Un PDF joint pendant que l'app redémarrait, un rendu qui a
 * échoué une fois, un fichier arrivé avant que la fonctionnalité existe : la
 * journée se rouvre, et la vignette se fait. Le déclencher à l'ajout laissait
 * au contraire une rangée nue définitive, sans rien pour le dire ni le
 * rattraper.
 *
 * Rend `true` quand une vignette a été posée — à l'appelant de revalider.
 */
export async function assurerApercu(piece: JournalPiece): Promise<boolean> {
  if (piece.kind !== "pdf" || piece.apercu || tentees.has(piece.id)) return false;
  tentees.add(piece.id);
  try {
    const reponse = await fetch(convertFileSrc(piece.chemin));
    const rendu = await apercuDuPdf(new Uint8Array(await reponse.arrayBuffer()));
    await journalApi.poserApercu(piece.id, Array.from(rendu.octets), rendu.pages);
    return true;
  } catch (e) {
    // La pièce garde sa rangée nue, qui reste juste : rien n'a été perdu, et
    // le document s'ouvre toujours.
    console.warn("apercu:", e);
    return false;
  }
}
