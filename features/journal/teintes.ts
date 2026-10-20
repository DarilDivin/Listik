/**
 * Les couleurs de la lueur d'enregistrement, tirées de l'ACCENT.
 *
 * `voice-glow` peint sept « lobes » de lumière (le centre, puis trois paires
 * vers l'extérieur) et une bande à franges. Une lumière d'une seule teinte
 * est terne — essayé : tout en ambre, la lueur perd sa magie. L'accent tient
 * donc le centre, et des teintes VOISINES s'ouvrent de part et d'autre.
 *
 * Les rotations se font en OKLCH, l'espace où tourner une teinte garde sa
 * clarté perçue : en HSL, le jaune s'éclaircirait et le bleu s'éteindrait.
 */

type Rgb = [number, number, number];

const lineaire = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const gamma = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

export function versOklch([r8, g8, b8]: Rgb): [number, number, number] {
  const r = lineaire(r8);
  const g = lineaire(g8);
  const b = lineaire(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH → `#rrggbb`, l'écriture que la bibliothèque comprend. */
export function depuisOklch(L: number, C: number, h: number): string {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.5034186148 * m + 1.5076828264 * s),
  ];
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export interface TeintesVoix {
  /** Les sept lobes : le centre, puis trois paires vers l'extérieur. */
  lobes: string[];
  /** La bande : son arête et ses franges. */
  bande: { core: string; above: string; mid: string; below: string };
}

/**
 * Sur le fond sombre la lueur est une LUMIÈRE (claire, un cœur presque
 * blanc) ; sur le papier, un PIGMENT (plus dense, un cœur à la teinte de
 * l'accent) — une lumière blanche sur du blanc ne se verrait pas.
 */
export function teintesVoix(accent: Rgb, sombre: boolean): TeintesVoix {
  const [L0, C0, h] = versOklch(accent);
  const deg = Math.PI / 180;
  // L'accent « Encre » n'a pas de teinte : sa lumière reste neutre — de
  // l'argent en sombre, un lavis d'encre sur le papier. Lui imposer la
  // chroma des autres la teindrait au hasard de sa teinte résiduelle.
  const neutre = C0 < 0.04;
  const L = sombre ? Math.max(0.68, L0) : Math.min(0.62, Math.max(0.45, L0));
  const C = neutre ? 0.012 : Math.max(0.11, C0 * 1.2);
  // Sur le papier, l'éventail se resserre de moitié : à clarté moyenne, les
  // voisines d'un ambre tirent vers le jaune, et un jaune foncé, c'est du
  // kaki — essayé, la lueur prenait des reflets olive.
  const ecart = sombre ? 1 : 0.5;
  const t = (decalage: number, dL = 0, fC = 1) =>
    depuisOklch(L + dL, C * fC, h + decalage * ecart * deg);
  return {
    // Des voisines PROCHES : à 40° et plus, l'ambre tournait au vert d'un
    // côté et au saumon de l'autre — la lueur ne disait plus l'accent.
    lobes: [
      t(0),
      t(18, -0.02),
      t(-22, 0.02),
      t(8, 0.06, 0.8),
      t(-10, -0.04, 1.1),
      t(32, 0, 0.85),
      t(-36, 0, 0.85),
    ],
    bande: {
      core: sombre ? depuisOklch(0.95, C * 0.25, h) : t(0, -0.08, 1.2),
      above: t(18),
      mid: t(0),
      below: t(-22),
    },
  };
}
