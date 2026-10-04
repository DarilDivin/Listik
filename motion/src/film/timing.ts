/*
 * La carte des temps du film, calée sur la musique (« Minimal », PaulYudin,
 * Pixabay). Source unique : tout le montage se place en mesures, jamais en
 * durées additionnées (un temps vaut 30,65 images, les arrondis dériveraient).
 *
 * Les temps (en secondes dans le morceau) sortent d'une analyse librosa :
 * 117,5 BPM ; le premier temps détecté (3,111 s) est bien un premier temps de
 * mesure (les changements d'accords tombent dessus) ; creux de 49,9 s à 66,4 s
 * puis retour plein. Le film est calé pour que la mesure 0 (premier temps
 * fort) tombe à 5,0 s : la musique entre donc à 1,889 s.
 */
export const FPS = 60;

/** Temps détectés dans le morceau (secondes). */
export const BEATS: readonly number[] = [3.111, 3.622, 4.133, 4.644, 5.155, 5.666, 6.153, 6.664, 7.175, 7.686, 8.197, 8.707, 9.218, 9.729, 10.240, 10.728, 11.238, 11.749, 12.260, 12.771, 13.282, 13.793, 14.303, 14.814, 15.325, 15.836, 16.347, 16.834, 17.345, 17.856, 18.367, 18.878, 19.389, 19.900, 20.410, 20.898, 21.409, 21.920, 22.430, 22.941, 23.452, 23.963, 24.474, 24.961, 25.496, 25.983, 26.517, 27.005, 27.516, 28.026, 28.537, 29.048, 29.559, 30.070, 30.581, 31.068, 31.579, 32.090, 32.601, 33.112, 33.622, 34.133, 34.644, 35.132, 35.666, 36.153, 36.664, 37.175, 37.686, 38.197, 38.708, 39.219, 39.729, 40.217, 40.751, 41.239, 41.749, 42.260, 42.771, 43.282, 43.793, 44.304, 44.815, 45.302, 45.813, 46.324, 46.835, 47.345, 47.856, 48.367, 48.878, 49.389, 49.900, 50.411, 50.921, 51.432, 51.943, 52.454, 52.941, 53.452, 53.963, 54.474, 54.985, 55.496, 56.007, 56.517, 57.028, 57.516, 58.027, 58.538, 59.048, 59.559, 60.070, 60.581, 61.092, 61.603, 62.113, 62.624, 63.112, 63.623, 64.134, 64.691, 65.271, 65.852, 66.409, 66.920, 67.431, 67.942, 68.452, 68.963, 69.474, 69.985, 70.496, 71.007, 71.494, 72.005, 72.516, 73.027, 73.538, 74.048, 74.559, 75.070, 75.558, 76.069, 76.579, 77.090, 77.601, 78.112, 78.623, 79.134, 79.644, 80.155, 80.666, 81.154, 81.665, 82.175, 82.686, 83.197, 83.708, 84.219, 84.730, 85.240, 85.751, 86.239, 86.750, 87.261, 87.771, 88.282, 88.793, 89.304, 89.815, 90.302, 90.813, 91.324, 91.835, 92.346, 92.857, 93.367, 93.878, 94.389, 94.900, 95.411, 95.898, 96.409, 96.920, 97.431, 97.942, 98.453];

/** Décalage film ← morceau : le morceau commence à LEAD secondes dans le film. */
export const LEAD = 5.0 - BEATS[0];

/** Début de la mesure n, en secondes dans le film. */
export const bar = (n: number) => BEATS[n * 4] + LEAD;
/** Temps b (index absolu), en secondes dans le film. */
export const beat = (b: number) => BEATS[b] + LEAD;
/** Secondes → image (arrondi, à partir d'un temps absolu). */
export const f = (seconds: number) => Math.round(seconds * FPS);

/** Le sting du logo : son impact de goutte (2,55 s) tombe sur le retour de la musique (mesure 31). */
export const STING_IMPACT = 2.55;

export const SHOTS = {
  hook: { from: 0, to: bar(0) },
  keys: { from: bar(0), to: bar(2) },
  capture: { from: bar(2), to: bar(6) },
  land: { from: bar(6), to: bar(8) },
  planner: { from: bar(8), to: bar(13) },
  journal: { from: bar(13), to: bar(18) },
  assistant: { from: bar(18), to: bar(23) },
  local: { from: bar(23), to: bar(31) - STING_IMPACT },
  sting: { from: bar(31) - STING_IMPACT, to: bar(35) },
} as const;

/** Fin du film : la musique s'éteint sur la mesure 34 → 35. */
export const END = bar(35);
