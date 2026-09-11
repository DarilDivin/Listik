/**
 * Le halo de la voix — peint au canvas, pas construit en DOM.
 *
 * Une lueur, c'est des dégradés qui se superposent et se redessinent. En DOM
 * il aurait fallu des dizaines d'éléments flous empilés, refaits vingt fois
 * par seconde ; ici c'est un seul élément et quelques chemins.
 *
 * DEUX MATIÈRES, PAS UNE. Sur la page sombre le halo est une LUMIÈRE : les
 * nappes s'additionnent (`lighter`) comme deux lampes braquées au même
 * endroit. Sur le papier clair, additionner revient à pousser vers le blanc —
 * et un halo additif y disparaît purement et simplement, parce qu'on ne rend
 * pas du papier plus lumineux. Là, c'est un PIGMENT qui se dépose
 * (`source-over`) : un lavis. Même forme, deux physiques.
 *
 * `globalCompositeOperation` ne mélange qu'à l'INTÉRIEUR du canvas ; le
 * canvas fini se pose ensuite normalement sur ce qu'il y a derrière.
 */

/** La teinte de marque n'est pas fixe : voir `[data-accent]` dans globals.css. */
export interface Palette {
  /** L'accent, tel qu'il est réglé. */
  a: [number, number, number];
  /** Un compagnon décalé : une lumière d'une seule teinte est plate. */
  b: [number, number, number];
  /** L'encre du texte, pour ce qui n'est pas lumineux. */
  encre: [number, number, number];
  force: number;
  flou: number;
  melange: GlobalCompositeOperation;
}

export const rgba = (c: [number, number, number], o: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${o})`;

/**
 * Résout une couleur CSS — `oklch()`, `color-mix()`, n'importe quoi — en
 * octets sRGB, en la peignant sur un pixel et en le relisant.
 *
 * C'est le seul moyen fiable : `getComputedStyle` rend la couleur dans
 * l'espace où elle a été écrite, et le canvas doit composer des alphas sur
 * des nombres.
 */
function versRgb(couleur: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  ctx.fillStyle = "#808080";
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

/** Tourne la teinte d'une couleur, en gardant sa clarté. */
function decaler([r, g, b]: [number, number, number], degres: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  h = (h * 60 + degres + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r2, g2, b2] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [
    Math.round((r2 + m) * 255),
    Math.round((g2 + m) * 255),
    Math.round((b2 + m) * 255),
  ];
}

// La palette ne se relit pas à chaque image : elle ne change qu'au thème ou à
// l'accent, et un `getImageData` par nappe et par image serait absurde.
let cache: Palette | null = null;

export function palette(): Palette {
  if (cache) return cache;
  const style = getComputedStyle(document.documentElement);
  const sombre = document.documentElement.classList.contains("dark");
  const a = versRgb(style.getPropertyValue("--brand").trim() || "#2a8b94");
  cache = {
    a,
    b: decaler(a, 22),
    encre: versRgb(style.getPropertyValue("--foreground").trim() || "#3a3630"),
    force: sombre ? 0.62 : 0.52,
    flou: sombre ? 20 : 16,
    melange: sombre ? "lighter" : "source-over",
  };
  return cache;
}

/**
 * Le thème et l'accent vivent tous deux sur `<html>` : `next-themes` y pose
 * la classe `dark`, le réglage d'accent y pose `data-accent`. Un seul
 * observateur suffit — y compris pour le thème « système », qui arrive lui
 * aussi sous forme de changement de classe.
 */
if (typeof document !== "undefined") {
  new MutationObserver(() => {
    cache = null;
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-accent"],
  });
}

/** Met le canvas à la taille de sa boîte, à la densité de l'écran. */
export function ajuster(canvas: HTMLCanvasElement) {
  const boite = canvas.getBoundingClientRect();
  const densite = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(boite.width));
  const h = Math.max(1, Math.round(boite.height));
  if (canvas.width !== Math.round(w * densite) || canvas.height !== Math.round(h * densite)) {
    canvas.width = Math.round(w * densite);
    canvas.height = Math.round(h * densite);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(densite, 0, 0, densite, 0, 0);
  return { ctx, w, h };
}

/**
 * Trois nappes, chacune avec sa propre ondulation et son propre retard.
 * C'est la superposition qui fait la profondeur : une seule nappe donne un
 * bourrelet, pas une lueur.
 */
const NAPPES = [
  { k: 1.6, v: 0.55, h: 1.0, o: 0.55, teinte: "a" },
  { k: 2.7, v: -0.38, h: 0.72, o: 0.42, teinte: "b" },
  { k: 4.3, v: 0.81, h: 0.48, o: 0.34, teinte: "a" },
] as const;

/**
 * Le halo de l'ENREGISTREMENT : ancré en bas, il monte avec la voix.
 *
 * `t` est un temps en secondes — il fait dériver les nappes les unes par
 * rapport aux autres. `niveau` (0 à 1) commande la HAUTEUR et non l'opacité :
 * un halo qui ne ferait que s'éclaircir ne dirait rien du volume, il
 * clignoterait.
 */
export function peindreHalo(
  canvas: HTMLCanvasElement,
  pal: Palette,
  t: number,
  niveau: number,
): void {
  const mesure = ajuster(canvas);
  if (!mesure) return;
  const { ctx, w, h } = mesure;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (typeof ctx.filter === "string") ctx.filter = `blur(${pal.flou}px)`;
  ctx.globalCompositeOperation = pal.melange;

  for (const nappe of NAPPES) {
    const couleur = nappe.teinte === "a" ? pal.a : pal.b;
    const crete = h * (0.22 + 0.62 * niveau) * nappe.h;
    ctx.beginPath();
    ctx.moveTo(-pal.flou, h + pal.flou);
    const pas = Math.max(6, w / 48);
    for (let x = -pal.flou; x <= w + pal.flou; x += pas) {
      const onde = Math.sin((x / w) * Math.PI * nappe.k + t * nappe.v * 2.2);
      ctx.lineTo(x, h - crete * (0.55 + 0.45 * onde));
    }
    ctx.lineTo(w + pal.flou, h + pal.flou);
    ctx.closePath();
    const d = ctx.createLinearGradient(0, h - crete * 1.5, 0, h);
    d.addColorStop(0, rgba(couleur, 0));
    d.addColorStop(0.55, rgba(couleur, pal.force * nappe.o * 0.75));
    d.addColorStop(1, rgba(couleur, pal.force * nappe.o));
    ctx.fillStyle = d;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * La bande d'une note GARDÉE : la même matière, étirée sur la durée.
 *
 * Le relief ne vient plus du micro mais des crêtes mesurées à
 * l'enregistrement. `part` (0 à 1) est la fraction écoutée : elle s'allume,
 * le reste attend sous un voile.
 *
 * Rien ne bouge ici — c'est un dessin, pas une animation. Il ne se refait
 * qu'au changement d'avancement, de taille ou de thème.
 */
export function peindreBande(
  canvas: HTMLCanvasElement,
  pal: Palette,
  cretes: number[],
  part: number,
): void {
  const mesure = ajuster(canvas);
  if (!mesure) return;
  const { ctx, w, h } = mesure;
  ctx.clearRect(0, 0, w, h);
  const n = cretes.length;
  if (n === 0) return;

  // ADOUCIE avant d'être dessinée. Quatre-vingt-seize valeurs brutes sur
  // trente-six pixels de haut, ce sont autant de festons : sous le flou, ça
  // ne fait plus une voix, ça fait une bavure. Une moyenne glissante rend le
  // geste de la phrase, qui est ce qu'on reconnaît d'une note à l'autre.
  const doux: number[] = [];
  for (let i = 0; i < n; i++) {
    let somme = 0;
    let compte = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      somme += cretes[j];
      compte++;
    }
    doux.push(somme / compte);
  }

  /** Le dessus de la bande, en courbe plutôt qu'en ligne brisée. */
  const arete = (echelle: number) => {
    const pts = doux.map((v, i) => [
      (i / (n - 1)) * w,
      // Un plancher : là où l'on s'est tu, la bande s'amincit sans se trouer.
      h - Math.max(0.07, v) * echelle * h * 0.88,
    ]);
    const c = new Path2D();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      c.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    c.lineTo(w, pts[pts.length - 1][1]);
    return c;
  };

  const corps = (echelle: number) => {
    const c = arete(echelle);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    return c;
  };

  const peindre = (voile: number) => {
    ctx.save();
    // Un flou FIXE et léger. Proportionnel à la hauteur, il valait six pixels
    // sur une bande qui en fait trente-six — tout se noyait.
    if (typeof ctx.filter === "string") ctx.filter = "blur(2.5px)";
    ctx.globalCompositeOperation = pal.melange;
    for (const nappe of NAPPES) {
      const couleur = nappe.teinte === "a" ? pal.a : pal.b;
      const d = ctx.createLinearGradient(0, 0, 0, h);
      d.addColorStop(0, rgba(couleur, 0));
      d.addColorStop(1, rgba(couleur, pal.force * nappe.o * voile));
      ctx.fillStyle = d;
      ctx.fill(corps(nappe.h));
    }
    ctx.restore();
    // L'arête, NETTE : c'est elle qui porte la forme. Sans elle la lueur
    // n'a pas de contour et deux notes se ressemblent.
    ctx.save();
    ctx.globalCompositeOperation = pal.melange;
    ctx.strokeStyle = rgba(pal.a, Math.min(1, 0.85 * voile));
    ctx.lineWidth = 1.25;
    ctx.lineJoin = "round";
    ctx.stroke(arete(1));
    ctx.restore();
  };

  // Ce qui reste à écouter : la forme est là, en veille.
  peindre(0.46);
  // Ce qui a été écouté s'allume.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w * part, h);
  ctx.clip();
  peindre(1);
  ctx.restore();
}
