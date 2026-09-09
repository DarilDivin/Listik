/**
 * Enregistrer une voix, et en garder la silhouette.
 *
 * Deux choses se mesurent PENDANT qu'on parle, parce que rien ne les
 * retrouverait après :
 *
 * — la DURÉE. Un WebM produit par `MediaRecorder` n'a pas de durée dans son
 *   en-tête : il est écrit en flux, sans savoir quand il s'arrêtera.
 *   `audio.duration` y répond `Infinity` jusqu'à ce qu'on ait cherché le bout.
 *   On compte donc le temps nous-mêmes, à l'horloge.
 *
 * — les CRÊTES. Les recalculer à l'affichage demanderait de décoder tout
 *   l'audio à chaque ouverture de la journée, pour dessiner une vignette.
 *   L'analyseur les donne gratuitement pendant qu'on enregistre : on les
 *   ramasse au passage.
 *
 * Le micro, lui, s'ouvre côté Rust — voir `src-tauri/src/permissions.rs`.
 */

/** Le nombre de crêtes gardées. Une centaine : assez pour une silhouette. */
const CRETES = 96;

/** Une mesure toutes les 50 ms — vingt par seconde, pour un tracé vivant. */
const PAS_MS = 50;

/**
 * En dessous, il ne s'est rien dit : c'est le bruit de fond de la pièce. Sans
 * ce plancher, la normalisation ci-dessous ferait d'un silence une voix.
 */
const PLANCHER = 0.02;

export interface NoteEnregistree {
  octets: Uint8Array;
  /** Millisecondes, à l'horloge. */
  dureeMs: number;
  /** Une centaine de valeurs entre 0 et 1. */
  cretes: number[];
}

export interface Enregistrement {
  /** Arrête, ferme le micro, et rend la note. */
  arreter: () => Promise<NoteEnregistree>;
  /** Arrête et JETTE : le micro se ferme, rien n'est rendu. */
  annuler: () => void;
}

/**
 * Ramène une suite de mesures à `CRÊTES` valeurs.
 *
 * Le MAXIMUM de chaque tranche, pas la moyenne : une silhouette doit montrer
 * où la voix a porté. Moyenner écraserait les accents dans le silence qui les
 * entoure, et trente secondes de parole rendraient un trait presque droit.
 */
export function reduire(mesures: number[]): number[] {
  if (mesures.length === 0) return [];
  const sortie: number[] = [];
  for (let i = 0; i < CRETES; i++) {
    const debut = Math.floor((i * mesures.length) / CRETES);
    const fin = Math.max(debut + 1, Math.floor(((i + 1) * mesures.length) / CRETES));
    let haut = 0;
    for (let j = debut; j < fin && j < mesures.length; j++) {
      if (mesures[j] > haut) haut = mesures[j];
    }
    sortie.push(haut);
  }

  // NORMALISÉE : la silhouette dit le RYTHME, pas le volume. Une voix douce
  // et une voix forte doivent toutes deux remplir leur bande — sinon parler
  // à trente centimètres du micro rend un trait plat, qui ne dit plus rien.
  //
  // Sauf sous le plancher : là il n'y a que le souffle de la pièce, et
  // l'amplifier dessinerait une conversation dans un silence.
  const sommet = Math.max(...sortie);
  const echelle = sommet > PLANCHER ? 1 / sommet : 1;
  // Deux décimales : la bande fait cent pixels de haut, le reste est du bruit
  // qu'on écrirait en base pour rien.
  return sortie.map((v) => Math.round(Math.min(1, v * echelle) * 100) / 100);
}

/** Le format qu'on sait produire ET rejouer. Voir `db::nature`. */
function typeRetenu(): string {
  for (const type of ["audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

/**
 * Ouvre le micro et commence.
 *
 * `surNiveau` reçoit chaque mesure au vol : c'est ce qui fait bouger la bande
 * à l'écran pendant qu'on parle. Le tracé conservé, lui, se calcule à l'arrêt.
 *
 * Lève si le micro est refusé ou absent — à l'appelant de le dire.
 */
export async function enregistrer(
  surNiveau: (niveau: number) => void,
): Promise<Enregistrement> {
  const flux = await navigator.mediaDevices.getUserMedia({
    // Ce n'est pas de la musique, c'est une voix dans une pièce : le
    // navigateur sait déjà retirer l'écho et le souffle, autant le lui
    // demander.
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  // LE MAGNÉTOPHONE D'ABORD, L'ANALYSEUR ENSUITE. L'ordre n'est pas
  // esthétique : brancher le graphe Web Audio sur le flux AVANT de démarrer
  // `MediaRecorder` marche jusqu'au `start()`, et l'analyseur devient muet à
  // cet instant précis — il ne rend plus que des zéros pendant que
  // l'enregistrement, lui, capte parfaitement. La bande resterait plate d'un
  // bout à l'autre, sans la moindre erreur pour le dire.
  //
  // Mesuré : sur un signal synthétique constant, l'analyseur branché en
  // premier tombe de 0,44 à 0,008 au `start()` ; branché après, il lit 0,5
  // sans broncher pendant que le magnétophone écrit ses cent kilo-octets.
  const morceaux: Blob[] = [];
  const magnetophone = new MediaRecorder(flux, { mimeType: typeRetenu() });
  magnetophone.ondataavailable = (e) => {
    if (e.data.size > 0) morceaux.push(e.data);
  };
  const depart = performance.now();
  magnetophone.start();

  const contexte = new AudioContext();
  // Un contexte créé hors d'un geste peut naître suspendu ; l'analyseur ne
  // rendrait alors que des zéros, et la bande resterait plate.
  if (contexte.state === "suspended") await contexte.resume();
  const analyseur = contexte.createAnalyser();
  analyseur.fftSize = 1024;
  contexte.createMediaStreamSource(flux).connect(analyseur);
  const tampon = new Uint8Array(analyseur.fftSize);

  const mesures: number[] = [];
  const battement = setInterval(() => {
    analyseur.getByteTimeDomainData(tampon);
    // Le signal oscille autour de 128 : l'écart au repos EST l'amplitude.
    let ecart = 0;
    for (const v of tampon) {
      const d = Math.abs(v - 128);
      if (d > ecart) ecart = d;
    }
    const niveau = ecart / 128;
    mesures.push(niveau);
    surNiveau(niveau);
  }, PAS_MS);

  /** Rendre le micro : la pastille du système doit s'éteindre à l'arrêt. */
  const fermer = () => {
    clearInterval(battement);
    for (const piste of flux.getTracks()) piste.stop();
    void contexte.close();
  };

  return {
    arreter: () =>
      new Promise<NoteEnregistree>((resolve, reject) => {
        // La durée se lit AVANT d'attendre `onstop` : l'événement arrive
        // quelques dizaines de millisecondes plus tard, une fois le dernier
        // morceau écrit. Compter jusque-là allongerait chaque note.
        const dureeMs = Math.round(performance.now() - depart);
        magnetophone.onstop = () => {
          fermer();
          const blob = new Blob(morceaux, { type: magnetophone.mimeType });
          blob
            .arrayBuffer()
            .then((tampon) =>
              resolve({
                octets: new Uint8Array(tampon),
                dureeMs,
                cretes: reduire(mesures),
              }),
            )
            .catch(reject);
        };
        magnetophone.stop();
      }),
    annuler: () => {
      // Pas de `onstop` : personne n'attend les octets, et les laisser se
      // ramasser suffit. Le micro, lui, se ferme tout de suite.
      magnetophone.onstop = null;
      if (magnetophone.state !== "inactive") magnetophone.stop();
      fermer();
    },
  };
}

/** « 1:07 » — la durée d'une note, comme on la lit sur un lecteur. */
export function minutage(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Le nom du fichier d'une note. Il ne sert qu'à l'EXPORT et au repli en
 * rangée nue : dans la page, c'est la forme d'onde qu'on voit.
 *
 * L'heure LOCALE, celle qu'on reconnaît — `toISOString()` rendrait UTC, et
 * une note de 21 h porterait le nom du lendemain.
 */
export function nomDeNote(quand = new Date()): string {
  const d = (n: number) => String(n).padStart(2, "0");
  const jour = `${quand.getFullYear()}-${d(quand.getMonth() + 1)}-${d(quand.getDate())}`;
  return `note-vocale-${jour}-${d(quand.getHours())}h${d(quand.getMinutes())}.webm`;
}
