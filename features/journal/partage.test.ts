import { describe, expect, it } from "vitest";
import { numerote, paginer } from "./partage";

/** Des lignes de 20 px, espacées comme un interligne. */
const lignes = (n: number, pas = 28) =>
  Array.from({ length: n }, (_, i) => ({ haut: i * pas, bas: i * pas + 20 }));

describe("paginer", () => {
  it("coupe entre deux lignes, jamais au milieu", () => {
    // Lignes de 20 px tous les 28 px, pages de 100 px : la 4e ligne finirait
    // à 3 × 28 + 20 = 104 px — elle passe à la page suivante, entière.
    expect(paginer(lignes(10), 100)).toEqual([
      { haut: 0, bas: 76 },
      { haut: 84, bas: 160 },
      { haut: 168, bas: 244 },
      { haut: 252, bas: 272 },
    ]);
  });

  it("remplit la page même au milieu d'un paragraphe", () => {
    // Un seul long paragraphe : il ne laisse plus de page à moitié vide.
    const pages = paginer(lignes(30), 400);
    expect(pages).toHaveLength(3);
    expect(pages[0].bas).toBeGreaterThan(380);
  });

  it("donne une page à elle seule à une image plus haute qu'une page, rognée", () => {
    const l = [{ haut: 0, bas: 20 }, { haut: 30, bas: 530 }, { haut: 540, bas: 560 }];
    expect(paginer(l, 200)).toEqual([
      { haut: 0, bas: 20 },
      { haut: 30, bas: 230 },
      { haut: 540, bas: 560 },
    ]);
  });
});

describe("numerote", () => {
  it("numérote sur autant de chiffres que le total", () => {
    expect(numerote("C:/x/Le phare.png", 2, 3)).toBe("C:/x/Le phare 2.png");
    expect(numerote("C:/x/Le phare.png", 2, 16)).toBe("C:/x/Le phare 02.png");
  });
});
