import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Les RÈGLES des accents (voir les blocs `[data-accent]` de globals.css),
 * vérifiées sur les valeurs réellement écrites dans la feuille de style.
 * Un accent ajouté ou retouché un jour ne peut pas être illisible.
 *
 * Contraste : la norme officielle (WCAG 2) — 4,5:1 pour du texte, 3:1 pour
 * un élément d'interface. L'égalité d'éclat en sombre se mesure avec APCA,
 * plus juste que WCAG sur fond sombre (sans valeur officielle : on ne s'en
 * sert que pour comparer les accents entre eux).
 */

const racine = join(__dirname, "..");
const css = readFileSync(join(racine, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const prefs = readFileSync(join(racine, "components/ui-prefs.tsx"), "utf8");

// ── La feuille de style, lue règle par règle ────────────────────────────
type Regle = { selecteurs: string[]; vars: Record<string, string> };
const regles: Regle[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, corps]) => ({
  selecteurs: sel.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
  vars: Object.fromEntries([...corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])),
}));
function variables(selecteur: string, nom: string): Record<string, string> {
  const r = regles.find((x) => x.selecteurs.includes(selecteur) && nom in x.vars);
  if (!r) throw new Error(`Pas de règle « ${selecteur} » qui définit ${nom}`);
  return r.vars;
}

// ── Couleurs ────────────────────────────────────────────────────────────
type Rgb = [number, number, number];
function oklch(valeur: string): { lin: Rgb; srgb: Rgb; h: number } {
  const m = valeur.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`Pas un oklch opaque : ${valeur}`);
  const [L, C, hDeg] = m.slice(1).map(Number);
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: Rgb = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.5034186148 * mm + 1.5076828264 * s,
  ];
  const gamma = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  return { lin, srgb: lin.map(gamma) as Rgb, h: hDeg };
}
const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const wcag = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** APCA 0.0.98G-4g, en valeur absolue (Lc). */
function apca(texte: Rgb, fond: Rgb): number {
  const Y = (c: Rgb) => {
    const y = 0.2126729 * c[0] ** 2.4 + 0.7151522 * c[1] ** 2.4 + 0.072175 * c[2] ** 2.4;
    return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
  };
  const [yt, yb] = [Y(texte), Y(fond)];
  const s = yb > yt ? (yb ** 0.56 - yt ** 0.57) * 1.14 : (yb ** 0.65 - yt ** 0.62) * 1.14;
  return Math.abs(s) < 0.1 ? 0 : (Math.abs(s) - 0.027) * 100;
}
/** Un fond semi-transparent posé sur une surface, comme le fait le navigateur. */
const surFond = (avant: Rgb, part: number, fond: Rgb) => avant.map((v, i) => v * part + fond[i] * (1 - part)) as Rgb;

// ── Ce qu'on vérifie ────────────────────────────────────────────────────
const listeAccents = prefs.match(/export const ACCENTS = \[([\s\S]*?)\] as const/)![1];
const ids = [...listeAccents.matchAll(/\{ id: "([\w-]+)"/g)].map(([, id]) => id);
const NEUTRE = "encre";
const couleurs = ids.filter((id) => id !== NEUTRE);

const lavis = (sel: string) => Number(variables(sel, "--brand-soft")["--brand-soft"].match(/(\d+)%/)![1]) / 100;
const THEMES = {
  clair: {
    surfaces: { fond: variables(":root", "--background"), carte: variables(":root", "--card") },
    lavis: lavis(":root"),
    accent: (id: string) => variables(`[data-accent="${id}"]`, "--brand"),
  },
  sombre: {
    surfaces: {
      fond: variables(".dark", "--background"),
      carte: variables(".dark", "--card"),
      "noir pur": variables(".dark[data-oled]", "--background"),
    },
    lavis: lavis(".dark"),
    accent: (id: string) => variables(`.dark[data-accent="${id}"]`, "--brand"),
  },
};
const surface = (vars: Record<string, string>) =>
  oklch(vars["--background"] ?? vars["--card"]).srgb;

describe("les accents", () => {
  it("sont six, et chacun a ses deux thèmes (y compris pour une pastille intérieure)", () => {
    expect(ids).toHaveLength(6);
    for (const id of ids) {
      expect(() => variables(`[data-accent="${id}"]`, "--brand")).not.toThrow();
      expect(() => variables(`.dark[data-accent="${id}"]`, "--brand")).not.toThrow();
      expect(() => variables(`.dark [data-accent="${id}"]`, "--brand")).not.toThrow();
    }
  });

  for (const [theme, T] of Object.entries(THEMES)) {
    describe(`en thème ${theme}`, () => {
      for (const id of ids) {
        const v = T.accent(id);
        const aplat = oklch(v["--brand"]);
        const texte = oklch(v["--brand-text"]);
        const surAplat = oklch(v["--brand-foreground"]);

        it(`${id} : tout tient dans sRGB (même couleur sur Mac et sur PC)`, () => {
          for (const c of [aplat, texte, surAplat]) {
            for (const canal of c.lin) {
              expect(canal).toBeGreaterThanOrEqual(-0.002);
              expect(canal).toBeLessThanOrEqual(1.002);
            }
          }
        });

        it(`${id} : ce qui s'écrit sur l'aplat se lit (4,5:1)`, () => {
          expect(wcag(surAplat.srgb, aplat.srgb)).toBeGreaterThanOrEqual(4.5);
        });

        for (const [nom, vars] of Object.entries(T.surfaces)) {
          const s = nom === "carte" ? oklch(vars["--card"]).srgb : surface(vars);
          it(`${id} sur ${nom} : l'aplat se détache (3:1), le texte se lit (4,5:1), même sur le lavis`, () => {
            expect(wcag(aplat.srgb, s)).toBeGreaterThanOrEqual(3);
            expect(wcag(texte.srgb, s)).toBeGreaterThanOrEqual(4.5);
            expect(wcag(texte.srgb, surFond(aplat.srgb, T.lavis, s))).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
    });
  }

  it("ont le même poids : même profondeur de texte en clair, même éclat en sombre", () => {
    const fondClair = surface(THEMES.clair.surfaces.fond);
    const fondSombre = surface(THEMES.sombre.surfaces.fond);
    const profondeurs = couleurs.map((id) => wcag(oklch(THEMES.clair.accent(id)["--brand-text"]).srgb, fondClair));
    const eclats = couleurs.map((id) => apca(oklch(THEMES.sombre.accent(id)["--brand"]).srgb, fondSombre));
    expect(Math.max(...profondeurs) - Math.min(...profondeurs)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...eclats) - Math.min(...eclats)).toBeLessThanOrEqual(3);
  });

  it("évitent les teintes qui ont un sens : le rouge (en retard) et l'émeraude (priorité basse)", () => {
    // `--destructive` et `priorityRingColor("low")` (#10b981), en teinte oklch.
    const ROUGE = oklch(variables(":root", "--destructive")["--destructive"]).h;
    const EMERAUDE = 162;
    const ecart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    for (const id of couleurs) {
      const h = oklch(THEMES.clair.accent(id)["--brand"]).h;
      expect(ecart(h, ROUGE), `${id} trop près du rouge`).toBeGreaterThanOrEqual(28);
      expect(ecart(h, EMERAUDE), `${id} trop près de l'émeraude`).toBeGreaterThanOrEqual(28);
    }
  });
});
