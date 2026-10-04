/*
 * Courbes d'accélération et petits outils de temps.
 *
 * Les courbes reprennent exactement celles de GSAP utilisées par le prototype
 * validé (la pose de la plume et la chute de la goutte), pour garder le même
 * geste ; tout le reste passe par `Easing` de Remotion.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Avancement 0 → 1 d'une phase qui commence à `start` et dure `dur` (secondes). */
export const phase = (t: number, start: number, dur: number) =>
  clamp01((t - start) / dur);

/** GSAP « power2 » (cubique). */
export const power2 = {
  in: (t: number) => t ** 3,
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? (2 * t) ** 3 / 2 : 1 - (2 * (1 - t)) ** 3 / 2),
};

/** GSAP « back.out(overshoot) ». */
export const backOut = (t: number, overshoot = 1.70158) => {
  const p = t - 1;
  return t <= 0 ? 0 : p * p * ((overshoot + 1) * p + overshoot) + 1;
};

/** GSAP « elastic.out(1, period) ». */
export const elasticOut = (t: number, period = 0.3) =>
  t <= 0
    ? 0
    : t >= 1
      ? 1
      : 2 ** (-10 * t) * Math.sin((t - period / 4) * ((2 * Math.PI) / period)) + 1;

/** Réponse d'un choc amorti : 0 avant le choc, une oscillation qui s'éteint après. */
export const impulse = (dt: number, hz = 4.5, decay = 8) =>
  dt <= 0 ? 0 : Math.sin(dt * 2 * Math.PI * hz) * Math.exp(-dt * decay);
