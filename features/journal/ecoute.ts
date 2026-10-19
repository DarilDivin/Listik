/**
 * Ce que la lueur ENTEND — le signal brut, rendu lisible pour une animation.
 *
 * L'ancien halo lisait une seule chose : la crête de l'onde, vingt fois par
 * seconde, telle quelle. Trois défauts en sortaient, et c'est eux qu'on voyait :
 *
 * — une crête n'est pas un VOLUME. Une consonne sèche et une voyelle tenue
 *   donnent la même crête ; l'oreille, elle, entend l'énergie. On mesure donc
 *   la moyenne quadratique, en décibels, parce que c'est ainsi qu'on perçoit.
 *
 * — un nombre brut SAUTE. Il faut une enveloppe : monter vite (une syllabe
 *   doit se voir à l'instant où elle est dite), redescendre lentement (sinon
 *   la lumière clignote entre deux mots).
 *
 * — un seul nombre ne dit pas QUOI. Une voix, c'est une fondamentale grave,
 *   des formants au milieu, des sifflantes en haut. Trois bandes suffisent
 *   pour que « sss » et « ooo » ne bougent pas la lumière de la même façon.
 *
 * Et par-dessus, un RESSORT : la hauteur ne suit pas le niveau, elle y est
 * attachée. Elle le rattrape avec un léger dépassement, et c'est ce petit
 * rebond amorti qui fait dire « organique » à l'œil.
 */

/** Ce que la lueur reçoit à chaque image. Tout est entre 0 et 1. */
export interface Ecoute {
  /** Le volume perçu, sous enveloppe. */
  niveau: number;
  /** La hauteur de la lumière : le niveau, monté sur ressort (peut dépasser 1). */
  elan: number;
  /** Fondamentale, formants, sifflantes. */
  graves: number;
  mediums: number;
  aigus: number;
  /** Un coup bref à chaque attaque de syllabe, qui retombe tout seul. */
  attaque: number;
}

export const SILENCE: Ecoute = {
  niveau: 0,
  elan: 0,
  graves: 0,
  mediums: 0,
  aigus: 0,
  attaque: 0,
};

/**
 * La plage utile, en dBFS : 40 dB sous le PLAFOND, qui n'est pas fixe. Un
 * micro de casque collé à la bouche et un micro d'ordinateur à un mètre ne
 * donnent pas les mêmes décibels pour la même voix ; avec un plafond fixe,
 * l'un saturait la lumière en permanence et l'autre la laissait couchée.
 *
 * Le plafond suit donc le plus fort qu'on ait entendu récemment, et
 * redescend lentement. Jamais sous −30 dB cependant : sans ce plancher, le
 * silence d'une pièce finirait rapporté à lui-même, et la lumière
 * s'agiterait sur le souffle.
 */
const PLAGE_DB = 40;
const PLAFOND_MIN_DB = -30;
/** Ce que le plafond perd par seconde quand on parle moins fort. */
const DECRUE_DB = 2.5;

/** Les bandes, en hertz. */
const BANDES: [number, number][] = [
  [80, 320], // la fondamentale
  [320, 2000], // les formants — là où sont les voyelles
  [2000, 7000], // les sifflantes, les « s », les « ch »
];

/**
 * Lissage indépendant de la cadence : la même constante de temps à 60 et à
 * 144 images par seconde. Un lissage « × 0,9 par image » irait deux fois
 * plus vite sur un écran rapide.
 */
const suivre = (actuel: number, cible: number, dt: number, tau: number) =>
  actuel + (cible - actuel) * (1 - Math.exp(-dt / tau));

/** Monte vite, redescend lentement. */
const enveloppe = (
  actuel: number,
  cible: number,
  dt: number,
  montee: number,
  descente: number,
) => suivre(actuel, cible, dt, cible > actuel ? montee : descente);

const borner = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Décibels → 0..1 sous `plafond`, avec une courbe douce aux deux bouts. */
export function versUnite(db: number, plafond = -14): number {
  if (!Number.isFinite(db)) return 0;
  const u = borner((db - (plafond - PLAGE_DB)) / PLAGE_DB);
  // Smoothstep : pas de seuil franc à l'entrée du plancher, pas de mur au
  // plafond. Un murmure s'allume doucement au lieu de basculer.
  return u * u * (3 - 2 * u);
}

/**
 * L'oreille : un état qui se lit à chaque image.
 *
 * `lire(dt)` interroge l'analyseur ; `eteindre(dt)` fait retomber tout à zéro
 * SANS le toucher — c'est ce qu'il faut pendant la sortie, quand le micro est
 * déjà fermé et que l'analyseur ne rend plus que du vide ou du périmé.
 */
export function creerOreille(analyseur: AnalyserNode | null) {
  const temps = analyseur ? new Float32Array(analyseur.fftSize) : null;
  const spectre = analyseur ? new Float32Array(analyseur.frequencyBinCount) : null;
  const hzParCase = analyseur ? analyseur.context.sampleRate / analyseur.fftSize : 0;

  // Le gain automatique de chaque bande : le maximum récent, qui redescend
  // lentement. Un micro de casque et un micro d'ordinateur ne donnent pas les
  // mêmes décibels par bande ; rapportée à son propre sommet, chaque bande
  // sait remplir sa part de la lumière.
  const sommets = [0.25, 0.25, 0.25];

  const etat: Ecoute = { ...SILENCE };
  // On part bas : la première phrase prononcée le relèvera aussitôt.
  let plafond = PLAFOND_MIN_DB;
  let vitesse = 0;
  let precedent = 0;

  /** Le ressort, sous-amorti : il rattrape la cible avec un léger rebond. */
  const ressort = (dt: number) => {
    // Raideur et amortissement choisis pour un dépassement de ~8 % et un
    // retour au calme en un quart de seconde — vif sans trembler.
    const raideur = 210;
    const amorti = 19;
    // Pas fixes : un écran qui saute une image ne doit pas faire exploser
    // l'intégration.
    let reste = Math.min(dt, 0.1);
    while (reste > 0) {
      const h = Math.min(reste, 1 / 240);
      vitesse += (raideur * (etat.niveau - etat.elan) - amorti * vitesse) * h;
      etat.elan += vitesse * h;
      reste -= h;
    }
    if (!Number.isFinite(etat.elan)) {
      etat.elan = etat.niveau;
      vitesse = 0;
    }
  };

  const bande = (lo: number, hi: number) => {
    if (!spectre) return 0;
    const debut = Math.max(1, Math.floor(lo / hzParCase));
    const fin = Math.min(spectre.length - 1, Math.ceil(hi / hzParCase));
    // Moyenne de la PUISSANCE, pas des décibels : moyenner des logarithmes
    // écrase les pics, et ce sont eux qui font une voix.
    let somme = 0;
    let n = 0;
    for (let i = debut; i <= fin; i++) {
      const db = spectre[i];
      // −Infinity sur une case muette : la puissance vaut alors zéro.
      if (Number.isFinite(db)) somme += 10 ** (Math.max(-140, db) / 10);
      n++;
    }
    return n ? 10 * Math.log10(somme / n + 1e-14) : -140;
  };

  const eteindre = (dt: number): Ecoute => {
    etat.niveau = suivre(etat.niveau, 0, dt, 0.12);
    etat.graves = suivre(etat.graves, 0, dt, 0.12);
    etat.mediums = suivre(etat.mediums, 0, dt, 0.12);
    etat.aigus = suivre(etat.aigus, 0, dt, 0.12);
    etat.attaque = suivre(etat.attaque, 0, dt, 0.08);
    ressort(dt);
    return etat;
  };

  return {
    etat,
    eteindre,

    lire(dt: number): Ecoute {
      if (!analyseur || !temps || !spectre) return eteindre(dt);

      analyseur.getFloatTimeDomainData(temps);
      let carres = 0;
      for (let i = 0; i < temps.length; i++) carres += temps[i] * temps[i];
      const rms = Math.sqrt(carres / temps.length);
      const db = 20 * Math.log10(rms + 1e-9);
      // 3 dB de marge au-dessus du plus fort : le sommet d'une phrase doit
      // TOUCHER le haut, pas s'y écraser.
      plafond = Math.max(PLAFOND_MIN_DB, db + 3, plafond - DECRUE_DB * dt);
      const brut = versUnite(db, plafond);

      // 25 ms pour monter : une syllabe s'allume le temps qu'on la prononce.
      // 260 ms pour retomber : entre deux mots, la lumière reste en l'air.
      etat.niveau = enveloppe(etat.niveau, brut, dt, 0.025, 0.26);

      analyseur.getFloatFrequencyData(spectre);
      const cles = ["graves", "mediums", "aigus"] as const;
      BANDES.forEach(([lo, hi], i) => {
        // La bande est bien plus bas que le total (elle n'en est qu'une
        // part) : on la décale de 12 dB avant de la ramener à l'unité.
        const v = versUnite(bande(lo, hi) + 12, plafond);
        // Le sommet décroît d'un tiers par seconde, sans jamais tomber sous
        // un plancher : sans ça, le souffle d'une pièce silencieuse finirait
        // rapporté à lui-même et remplirait toute la bande.
        sommets[i] = Math.max(0.18, v, sommets[i] * Math.exp(-dt / 3));
        const cible = borner(v / sommets[i]) * brut ** 0.5;
        etat[cles[i]] = enveloppe(etat[cles[i]], cible, dt, 0.03, 0.22);
      });

      // L'ATTAQUE : la montée du niveau brut, pas le niveau. Elle ne s'allume
      // qu'au début d'une syllabe et retombe d'elle-même — c'est le battement
      // qui fait sentir le rythme de la parole.
      const montee = Math.max(0, brut - precedent);
      precedent = suivre(precedent, brut, dt, 0.05);
      etat.attaque = borner(Math.max(etat.attaque * Math.exp(-dt / 0.18), montee * 3.2));

      ressort(dt);
      return etat;
    },
  };
}
