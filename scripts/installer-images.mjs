#!/usr/bin/env node
// Images des installateurs Windows, tirées de la charte (brand/) :
//
//   node scripts/installer-images.mjs   → src-tauri/installer/*.bmp
//
// NSIS (installateur -setup.exe) et WiX (.msi) n'acceptent que des BMP 24 bits
// à des tailles fixes. On dessine les SVG de brand/ dans un canevas d'Edge
// (headless, celui du système), puis on écrit le BMP octet par octet : aucune
// dépendance d'image. Encre et papier, comme le reste de l'identité.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright-core");

const svg = (name) => `data:image/svg+xml;base64,${readFileSync(join(ROOT, "brand", name)).toString("base64")}`;
const LOGOTYPE_INK = svg("listik-logotype.svg");
const LOGOTYPE_IVORY = svg("listik-logotype-light.svg");
const LOGO_RATIO = 1538 / 4415.2; // hauteur / largeur du logotype

// La plaque de l'icône : dégradé vertical de la charte (brand/README.md).
const PLATE = ["#252c2a", "#151a19"];
const WHITE = "#ffffff"; // fond des en-têtes NSIS et WiX (couleur de fenêtre de Windows)

/**
 * Chaque image : taille imposée, puis ce qu'on y pose.
 * - panel : plaque sombre sur `width` px à gauche, logotype ivoire centré dedans ;
 * - logo  : logotype encre sur blanc, à la place indiquée.
 */
const IMAGES = [
  // Écrans d'accueil et de fin de l'installateur et du désinstallateur.
  { file: "nsis-sidebar.bmp", w: 164, h: 314, panel: { width: 164, logo: 108, y: 0.42 } },
  // En-tête des étapes intermédiaires (à gauche du titre de l'étape).
  { file: "nsis-header.bmp", w: 150, h: 57, logo: { width: 86, x: 16, y: "center" } },
  // MSI : fond des écrans d'accueil et de fin ; WiX écrit son texte à droite de 164 px.
  { file: "wix-dialog.bmp", w: 493, h: 312, panel: { width: 164, logo: 108, y: 0.42 } },
  // MSI : bandeau des étapes intermédiaires ; WiX écrit son titre à gauche.
  { file: "wix-banner.bmp", w: 493, h: 58, logo: { width: 78, x: "right", y: "center", margin: 18 } },
];

/** BMP 24 bits, lignes de bas en haut, chacune complétée à un multiple de 4 octets. */
function bmp24(width, height, rgba) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = Buffer.alloc(size);
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(size, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * height, 34);
  out.writeInt32LE(2835, 38); // 72 ppp
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      out[dst + x * 3] = rgba[src + 2];
      out[dst + x * 3 + 1] = rgba[src + 1];
      out[dst + x * 3 + 2] = rgba[src];
    }
  }
  return out;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const outDir = join(ROOT, "src-tauri", "installer");
mkdirSync(outDir, { recursive: true });

for (const image of IMAGES) {
  const pixels = await page.evaluate(
    async ({ image, LOGOTYPE_INK, LOGOTYPE_IVORY, LOGO_RATIO, PLATE, WHITE }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const canvas = document.createElement("canvas");
      canvas.width = image.w;
      canvas.height = image.h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, image.w, image.h);

      if (image.panel) {
        const { width, logo, y } = image.panel;
        const plate = ctx.createLinearGradient(0, 0, 0, image.h);
        plate.addColorStop(0, PLATE[0]);
        plate.addColorStop(1, PLATE[1]);
        ctx.fillStyle = plate;
        ctx.fillRect(0, 0, width, image.h);
        const h = logo * LOGO_RATIO;
        ctx.drawImage(await load(LOGOTYPE_IVORY), Math.round((width - logo) / 2), Math.round(image.h * y - h / 2), logo, h);
      }
      if (image.logo) {
        const { width, x, y, margin = 0 } = image.logo;
        const h = width * LOGO_RATIO;
        const left = x === "right" ? image.w - margin - width : x;
        const top = y === "center" ? (image.h - h) / 2 : y;
        ctx.drawImage(await load(LOGOTYPE_INK), Math.round(left), Math.round(top), width, h);
      }
      return Array.from(ctx.getImageData(0, 0, image.w, image.h).data);
    },
    { image, LOGOTYPE_INK, LOGOTYPE_IVORY, LOGO_RATIO, PLATE, WHITE },
  );
  writeFileSync(join(outDir, image.file), bmp24(image.w, image.h, Uint8Array.from(pixels)));
  console.log(`src-tauri/installer/${image.file} (${image.w}×${image.h})`);
}

await browser.close();
