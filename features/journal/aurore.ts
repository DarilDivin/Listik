/**
 * L'aurore — la lueur d'enregistrement, peinte par la carte graphique.
 *
 * Le halo au canvas 2D superposait trois sinusoïdes floutées : une forme
 * régulière, qui ondulait au lieu de vivre. Une lumière qui paraît vivante
 * n'a pas de période. Ici chaque pixel est calculé par un petit programme
 * (un « shader ») à partir d'un BRUIT fractal — des collines de hasard
 * lissé, empilées à plusieurs échelles — qu'on déforme par un autre bruit.
 * C'est la recette des fumées, des flammes et des aurores de cinéma : rien
 * ne s'y répète jamais, et pourtant tout y est continu.
 *
 * La VOIX y entre par six nombres (voir `ecoute.ts`) :
 *   — l'élan lève la lumière, davantage au centre, sous la pilule ;
 *   — les graves l'élargissent, les médiums l'éclairent, les aigus font
 *     frémir son bord ;
 *   — l'attaque de chaque syllabe ravive le cœur posé sur le bord bas.
 *
 * Les couleurs viennent de l'ACCENT, tourné de part et d'autre sur le cercle
 * des teintes (en OKLCH, l'espace où une rotation garde la clarté perçue) :
 * une lumière d'une seule teinte est plate, trois teintes voisines font une
 * matière.
 */

import type { Ecoute } from "./ecoute";
import type { Palette } from "./halo";

const SOMMETS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENTS = `
precision highp float;

uniform vec2 uRes;
uniform float uTemps;
uniform float uOuverture;
uniform float uElan;
uniform float uNiveau;
uniform vec3 uBandes;
uniform float uAttaque;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uCoeur;
uniform float uForce;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Du hasard LISSÉ : une valeur par nœud d'une grille, interpolée entre eux.
float bruit(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

// Trois octaves seulement, chacune deux fois plus fine et deux fois plus
// faible, et tournée — la rotation efface l'alignement de la grille. Pas
// davantage : au-delà, le détail fin fait une NUÉE granuleuse, et une
// lumière n'a pas de grain.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * bruit(p);
    p = r * p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v / 0.875;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float x = uv.x;
  float y = uv.y;
  float aspect = uRes.x / uRes.y;
  // Les formes se mesurent en hauteurs de toile : sur une fenêtre large ou
  // étroite, une volute garde la même allure.
  float X = x * aspect;
  float t = uTemps;

  // Le centre porte la voix : la pilule est là, c'est de là que ça parle.
  // Les graves élargissent la cloche — une voix grave EMPLIT.
  float largeur = 0.5 + 0.3 * uBandes.x;
  float d = (x - 0.5) / largeur;
  float cloche = exp(-d * d * 2.4);

  // Le champ qui déforme : un bruit dont les coordonnées sont elles-mêmes
  // déplacées par un bruit. C'est ce double pli qui donne les volutes, et
  // il reste LENT et LARGE — ce sont des houles, pas des remous.
  vec2 q = vec2(X * 0.32, t * 0.07);
  vec2 pli = vec2(fbm(q + vec2(0.0, t * 0.04)), fbm(q + vec2(5.2, 1.3) - t * 0.035));
  float relief = fbm(q * 1.3 + pli * 1.4 + vec2(t * 0.05, 0.0));

  // Le frémissement des aigus, sur le BORD seulement : un « s » fait vibrer
  // la crête, il ne secoue pas toute la lumière.
  float fremi = (bruit(vec2(X * 2.2, t * 2.6)) - 0.5) * uBandes.z * 0.12;

  // LA HAUTEUR, en part de la toile. Au repos une braise couchée qui respire ;
  // en parlant, l'élan la lève, surtout au centre, sans jamais toucher le
  // haut de la toile.
  float souffle = 0.5 + 0.5 * sin(t * 1.3);
  float repos = 0.11 + 0.04 * relief + 0.015 * souffle;
  float voix = uElan * (0.16 + 0.62 * cloche) * (0.7 + 0.6 * relief);
  float h = clamp((repos + voix + fremi * (0.3 + cloche)) * uOuverture, 0.015, 0.78);

  // Le corps : une cloche de Gauss depuis le bord, dont le sommet ondule à
  // peine — la lumière s'évapore au lieu de s'arrêter sur un trait.
  float ondule = 0.88 + 0.24 * fbm(vec2(X * 0.9 + pli.x * 0.6, y * 1.6 - t * 0.22));
  float f = y / h * ondule;
  float corps = exp(-f * f * 1.7);

  // Le cœur : un liseré vif couché sur le bord bas, ravivé à chaque syllabe.
  float epaisseur = 0.025 + 0.04 * uElan * cloche + 0.025 * uAttaque;
  float coeur = exp(-y / epaisseur) * (0.4 + 0.3 * cloche + 0.55 * uAttaque * cloche);

  // LA COULEUR : trois teintes qui se partagent la largeur et COULENT
  // latéralement, chacune à sa vitesse. Basses fréquences : de grands pans
  // de couleur qui glissent, pas une marqueterie.
  float m1 = fbm(vec2(X * 0.45 - t * 0.09, y * 0.6 + t * 0.02));
  float m2 = fbm(vec2(X * 0.38 + t * 0.07 + 3.0, y * 0.5 + 7.0));
  vec3 couleur = mix(uA, uB, smoothstep(0.3, 0.7, m1));
  // Les aigus tirent vers la troisième — le « s » n'a pas la couleur du « o ».
  couleur = mix(couleur, uC, smoothstep(0.4, 0.75, m2) * (0.55 + 0.45 * uBandes.z));
  // Les médiums — les voyelles — éclairent la matière vers le cœur.
  couleur = mix(couleur, uCoeur, clamp(coeur * 0.75 + uBandes.y * 0.25 * corps * cloche, 0.0, 1.0));

  float alpha = corps * uForce * (0.7 + 0.3 * uNiveau) + coeur * 0.9;
  // Le haut de la toile est un MUR invisible : rien n'y doit arriver, sinon
  // la lueur s'y couperait net, à la règle.
  alpha *= 1.0 - smoothstep(0.62, 0.98, y);
  alpha = clamp(alpha * uOuverture, 0.0, 1.0);

  // Un grain d'un demi-niveau : sans lui, un dégradé aussi doux se découpe
  // en marches sur un écran 8 bits.
  alpha = clamp(alpha + (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0, 0.0, 1.0);

  // Prémultiplié : c'est ce que le compositeur attend. Sans ça, le bord de la
  // lueur se cernerait d'un liseré sombre.
  gl_FragColor = vec4(couleur * alpha, alpha);
}
`;

type Rgb = [number, number, number];

// --- Couleurs : OKLCH ------------------------------------------------------

const lineaire = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const gamma = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, c));
};

function versOklch([r8, g8, b8]: Rgb): [number, number, number] {
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

/** OKLCH → sRGB en 0..1, prêt pour le shader. */
function depuisOklch(L: number, C: number, h: number): Rgb {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.5034186148 * m + 1.5076828264 * s),
  ];
}

interface Teintes {
  a: Rgb;
  b: Rgb;
  c: Rgb;
  coeur: Rgb;
  force: number;
}

/**
 * Les quatre couleurs de l'aurore, tirées de l'accent.
 *
 * DEUX MATIÈRES, comme le halo : sur le fond sombre c'est une LUMIÈRE, qui
 * s'éclaircit vers son cœur ; sur le papier c'est un PIGMENT, qui s'y fonce
 * et s'y sature — une lumière blanche sur du blanc ne se verrait pas.
 */
function teintes(pal: Palette): Teintes {
  const sombre = pal.melange === "lighter";
  const [L, C, h] = versOklch(pal.a);
  // L'accent garde sa clarté de réglage ; on lui donne un peu plus de chroma,
  // une lumière se lit plus saturée qu'un aplat.
  const c0 = Math.max(0.09, C * 1.15);
  const rad = Math.PI / 180;
  if (sombre) {
    return {
      a: depuisOklch(L, c0, h),
      b: depuisOklch(L - 0.02, c0 * 1.05, h + 38 * rad),
      c: depuisOklch(L + 0.02, c0 * 0.95, h - 46 * rad),
      coeur: depuisOklch(Math.min(0.95, L + 0.2), c0 * 0.55, h + 10 * rad),
      force: 0.9,
    };
  }
  return {
    a: depuisOklch(L, c0, h),
    b: depuisOklch(L - 0.03, c0 * 1.05, h + 38 * rad),
    c: depuisOklch(L + 0.01, c0 * 0.95, h - 46 * rad),
    coeur: depuisOklch(Math.max(0.3, L - 0.14), c0 * 1.25, h + 6 * rad),
    force: 0.6,
  };
}

// --- Le moteur -------------------------------------------------------------

export interface Aurore {
  peindre(pal: Palette, t: number, ecoute: Ecoute, ouverture: number): void;
  /** Libère programme et tampons. Ne PERD pas le contexte : voir plus bas. */
  detruire(): void;
}

function compiler(gl: WebGLRenderingContext, type: number, source: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    // Dit tout haut : sans ce journal, un shader refusé ne laisse qu'un bas
    // d'écran vide, et rien pour dire pourquoi.
    console.error("aurore: shader refusé —", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * Prépare l'aurore sur un canvas. Rend `null` si WebGL manque ou refuse le
 * programme — à l'appelant de retomber sur le halo 2D.
 *
 * `echelle` : la lueur est floue par construction, on la calcule à une
 * fraction de la résolution et le navigateur l'agrandit. Personne ne voit la
 * différence ; la carte graphique, si.
 */
export function creerAurore(canvas: HTMLCanvasElement, echelle = 0.5): Aurore | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compiler(gl, gl.VERTEX_SHADER, SOMMETS);
  const fs = compiler(gl, gl.FRAGMENT_SHADER, FRAGMENTS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("aurore: programme refusé —", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }

  // Un seul triangle qui déborde l'écran : il le couvre entièrement, sans la
  // couture diagonale de deux triangles.
  const tampon = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (nom: string) => gl.getUniformLocation(prog, nom);
  const U = {
    res: u("uRes"),
    temps: u("uTemps"),
    ouverture: u("uOuverture"),
    elan: u("uElan"),
    niveau: u("uNiveau"),
    bandes: u("uBandes"),
    attaque: u("uAttaque"),
    a: u("uA"),
    b: u("uB"),
    c: u("uC"),
    coeur: u("uCoeur"),
    force: u("uForce"),
  };

  // Un contexte perdu (pilote réinitialisé, mise en veille) ne se dessine
  // plus : on s'arrête de peindre, la boucle de l'appelant continue de
  // compter sa sortie et de démonter à l'heure.
  let perdu = false;
  const surPerte = (e: Event) => {
    e.preventDefault();
    perdu = true;
  };
  canvas.addEventListener("webglcontextlost", surPerte);

  let palConnue: Palette | null = null;
  let couleurs: Teintes | null = null;

  return {
    peindre(pal, t, ecoute, ouverture) {
      if (perdu) return;
      const boite = canvas.getBoundingClientRect();
      const densite = Math.min(2, window.devicePixelRatio || 1) * echelle;
      const w = Math.max(1, Math.round(boite.width * densite));
      const h = Math.max(1, Math.round(boite.height * densite));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);

      // La palette change au thème ou à l'accent — `palette()` rend alors un
      // NOUVEL objet, et c'est à ce moment seulement qu'on refait les teintes.
      if (pal !== palConnue || !couleurs) {
        palConnue = pal;
        couleurs = teintes(pal);
      }

      gl.uniform2f(U.res, w, h);
      gl.uniform1f(U.temps, t);
      gl.uniform1f(U.ouverture, ouverture);
      gl.uniform1f(U.elan, ecoute.elan);
      gl.uniform1f(U.niveau, ecoute.niveau);
      gl.uniform3f(U.bandes, ecoute.graves, ecoute.mediums, ecoute.aigus);
      gl.uniform1f(U.attaque, ecoute.attaque);
      gl.uniform3fv(U.a, couleurs.a);
      gl.uniform3fv(U.b, couleurs.b);
      gl.uniform3fv(U.c, couleurs.c);
      gl.uniform3fv(U.coeur, couleurs.coeur);
      gl.uniform1f(U.force, couleurs.force);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    detruire() {
      canvas.removeEventListener("webglcontextlost", surPerte);
      // PAS de `loseContext()` : en développement, React démonte et remonte
      // l'effet sur le MÊME canvas, et le second `getContext` rendrait le
      // contexte perdu — une lueur noire, en dev seulement. On libère ce
      // qu'on a créé ; le contexte part avec le canvas.
      gl.deleteBuffer(tampon);
      gl.deleteProgram(prog);
    },
  };
}
