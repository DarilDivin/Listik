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
