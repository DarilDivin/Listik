/*
 * L!stik · sting du logo.
 *
 * Quatre temps, sans écriture à la main :
 *   1. le papier ; les lettres « L stik » font leur mise au point (flou → net)
 *      en montant légèrement, la place du « ! » reste vide ;
 *   2. la plume arrive d'en haut à droite, hors de la profondeur de champ et
 *      précédée de son ombre, se redresse avec un léger dépassement, plane un
 *      instant et se plante dans l'emplacement ; le L et le s s'écartent d'un rien ;
 *   3. la caméra s'approche du « ! » : une goutte naît à la pointe, gonfle,
 *      s'étire jusqu'à la ligne, se détache, s'écrase et laisse une onde ;
 *   4. la caméra recule, le logotype tient.
 *
 * Trois coupes de la même chorégraphie (voir CUTS) :
 *   - master : le sting seul, 5 s ;
 *   - social : le même, suivi d'un carton (la phrase du site, « Pour Windows ·
 *     gratuit »), cadré pour 16:9, carré et vertical ;
 *   - splash : l'écran d'ouverture de l'app, 2 s, sur fond transparent, sans
 *     mouvement de caméra pour que la dernière image tombe exactement là où
 *     l'app la place (voir SPLASH_GEOMETRY).
 *
 * Tout est fonction du temps (useCurrentFrame) : déterministe, rendu image par
 * image. Les coordonnées sont celles du logotype (unités de la police Fraunces,
 * x vers la droite, y vers le bas), voir logo-data.ts.
 */
import { loadFont } from "@remotion/fonts";
import { createContext, useContext, useId } from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Freeze,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  backOut,
  clamp01,
  elasticOut,
  impulse,
  lerp,
  phase,
  power2,
} from "./ease";
import { LETTERS, LOGO_ORIGIN, LOGO_VIEW, SLOT } from "./logo-data";

// Les polices du site, pour le carton des vidéos réseaux.
loadFont({ family: "Fraunces", url: staticFile("fonts/fraunces.woff2"), weight: "300 600" });
loadFont({ family: "DM Sans", url: staticFile("fonts/dm-sans.woff2"), weight: "100 1000" });

export type LogoStingProps = {
  readonly cut: "master" | "social" | "splash";
  readonly look: "paper" | "ink" | "appLight" | "appDark";
  /** Sans papier : pour incruster le logo (montage, écran d'ouverture de l'app). */
  readonly transparent: boolean;
};

type Look = {
  readonly ink: string;
  readonly shadow: string;
  readonly shadowStrength: number;
  readonly plate: string;
  readonly light: string;
  readonly vignette: string;
  readonly grainBlend: "multiply" | "screen";
  readonly grain: number;
};

const PAPER: Look = {
  ink: "#1d2220",
  shadow: "#1d2220",
  shadowStrength: 1,
  plate: "#f7f4ec",
  light: "rgba(255, 253, 247, 0.75)",
  vignette: "rgba(96, 80, 52, 0.10)",
  grainBlend: "multiply",
  grain: 0.05,
};
const INK: Look = {
  ink: "#f4f1e8",
  shadow: "#000000",
  shadowStrength: 1.9,
  plate: "linear-gradient(160deg, #252c2a 0%, #151a19 100%)",
  light: "rgba(244, 241, 232, 0.07)",
  vignette: "rgba(0, 0, 0, 0.38)",
  grainBlend: "screen",
  grain: 0.035,
};
const LOOKS: Record<LogoStingProps["look"], Look> = {
  paper: PAPER,
  ink: INK,
  // Les couleurs de texte de l'app (--foreground des thèmes clair et sombre,
  // app/globals.css), pour que le logo de l'écran d'ouverture soit celui de l'app.
  appLight: { ...PAPER, ink: "#251f1b", shadow: "#251f1b" },
  appDark: { ...INK, ink: "#f2f0ed" },
};

/* ---------- Coupes (secondes) ---------- */

type Cut = {
  readonly lettersStart: number;
  readonly letterStagger: number;
  readonly letterDur: number;
  readonly trackingDur: number;
  readonly nibStart: number;
  /** Le vol, puis la pose (elle plane à nibHover unités au-dessus de la place, puis se plante). */
  readonly nibFly: number;
  readonly nibPlant: number;
  readonly nibHover: number;
  /** Agrandissement de la plume quand elle est près de l'objectif (z = 1). */
  readonly nibDepth: number;
  readonly nibFadeIn: number;
  /**
   * D'où part la plume, en fraction du cadre. `null` : le départ réglé à la main
   * sur le maître 16:9 (en unités du logo), qu'on ne touche plus.
   */
  readonly nibFrom: { readonly x: number; readonly y: number } | null;
  /** Hauteur de l'arc au-dessus de la pointe, en unités du logo. */
  readonly arcLift: number;
  readonly dropDelay: number;
  /** 1 = la goutte du prototype ; plus vite pour l'écran d'ouverture. */
  readonly dropSpeed: number;
  readonly push: boolean;
  readonly drift: boolean;
  readonly endCard: boolean;
};

const MASTER: Cut = {
  lettersStart: 0.15,
  letterStagger: 0.075,
  letterDur: 0.95,
  trackingDur: 1.7,
  nibStart: 1.0,
  nibFly: 0.56,
  nibPlant: 0.13,
  nibHover: 240,
  nibDepth: 0.6,
  nibFadeIn: 0.1,
  nibFrom: null,
  arcLift: 1500,
  dropDelay: 0.1,
  dropSpeed: 1,
  push: true,
  drift: true,
  endCard: false,
};

const CUTS: Record<LogoStingProps["cut"], Cut> = {
  master: MASTER,
  social: { ...MASTER, nibFrom: { x: 0.74, y: -0.05 }, endCard: true },
  // Tout tient dans le cadre (transparent, donc bord franc) : la plume naît
  // floue à l'intérieur au lieu d'entrer par un coin, et l'arc reste plus bas.
  splash: {
    lettersStart: 0.04,
    letterStagger: 0.045,
    letterDur: 0.6,
    trackingDur: 1.0,
    nibStart: 0.3,
    nibFly: 0.42,
    nibPlant: 0.1,
    nibHover: 200,
    nibDepth: 0.3,
    nibFadeIn: 0.3,
    nibFrom: { x: 0.78, y: 0.32 },
    arcLift: 1100,
    dropDelay: 0.07,
    dropSpeed: 1.45,
    push: false,
    drift: false,
    endCard: false,
  },
};

const timeline = (cut: Cut) => {
  const land = cut.nibStart + cut.nibFly + cut.nibPlant;
  const drop = land + cut.dropDelay;
  const k = 1 / cut.dropSpeed;
  return {
    /** La pointe touche le papier. */
    land,
    /** La goutte naît à la pointe. */
    drop,
    k,
    impact: drop + 0.76 * k,
    /** La caméra a fini de reculer : le carton peut venir. */
    card: drop + 2.15,
  };
};
type Timeline = ReturnType<typeof timeline>;

const Sting = createContext<{ cut: Cut; tl: Timeline; look: Look }>({
  cut: MASTER,
  tl: timeline(MASTER),
  look: PAPER,
});

/* ---------- Géométrie (repère du logotype) ---------- */

const view = (x: number, y: number) => ({
  x: LOGO_ORIGIN.x + x,
  y: LOGO_ORIGIN.y - y,
});
const FONT_SPACE = `translate(${LOGO_ORIGIN.x} ${LOGO_ORIGIN.y}) scale(1 -1)`;
const TIP = view(SLOT.x + SLOT.tip.x, SLOT.nibY + SLOT.tip.y);
const CENTER = { x: LOGO_VIEW.width / 2, y: LOGO_VIEW.height / 2 };
/** Point visé par la caméra quand elle s'approche du « ! » : la plume et la goutte au centre. */
const DROP_FOCUS = { x: TIP.x, y: 800 };
const PUSH_ZOOM = 2;
/** Centre optique approximatif de chaque lettre, dans son propre repère. */
const LETTER_CENTER: Record<string, number> = { L: 575, s: 390, t: 292, i: 245, k: 520 };
const SLOT_CENTER = SLOT.x + SLOT.tip.x;

/**
 * Cadrage selon le format : largeur du logo (fraction de la largeur du cadre)
 * et hauteur de son centre, avant et pendant le carton. Le vertical reste au-
 * dessus du quart bas, où les réseaux posent leurs boutons et légendes.
 */
const framing = (width: number, height: number) =>
  width > height
    ? { fit: 0.56, y: 0.5, cardY: 0.42 }
    : width === height
      ? { fit: 0.7, y: 0.5, cardY: 0.42 }
      : { fit: 0.8, y: 0.44, cardY: 0.38 };

/**
 * L'écran d'ouverture de l'app : 1600 × 900, logo centré sur 56 % de la largeur,
 * caméra fixe. L'app (components/brand/ListikLogoMotion.tsx) cale la vidéo sur
 * ces proportions : à changer ensemble.
 */
export const SPLASH_GEOMETRY = { width: 1600, height: 900, fit: 0.56 };

const camera = (t: number, width: number, height: number, cut: Cut, tl: Timeline, duration: number) => {
  const f = framing(width, height);
  const fit = (width / LOGO_VIEW.width) * f.fit;
  // Une dérive lente vers l'arrière sur toute la durée : l'image n'est jamais figée.
  const drift = cut.drift
    ? lerp(1.04, 1, Easing.bezier(0.3, 0, 0.2, 1)(phase(t, 0, Math.min(duration, 5))))
    : 1;
  const push = cut.push
    ? power2.inOut(
        t < tl.drop + 1.25 ? phase(t, tl.drop - 0.7, 0.8) : 1 - phase(t, tl.drop + 1.25, 0.9),
      )
    : 0;
  // Le carton : le logo monte pour faire place à la phrase.
  const lift = cut.endCard ? Easing.bezier(0.65, 0, 0.35, 1)(phase(t, tl.card - 0.15, 0.8)) : 0;
  return {
    zoom: fit * drift * lerp(1, PUSH_ZOOM, push),
    fx: lerp(CENTER.x, DROP_FOCUS.x, push),
    fy: lerp(CENTER.y, DROP_FOCUS.y, push),
    ax: width / 2,
    ay: height * lerp(f.y, f.cardY, lift),
  };
};
type Camera = ReturnType<typeof camera>;

const useCamera = (): Camera => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const { cut, tl } = useContext(Sting);
  return camera(useCurrentFrame() / fps, width, height, cut, tl, durationInFrames / fps);
};

/** Un identifiant propre à chaque exemplaire du calque (le flou de mouvement en crée plusieurs). */
const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");

/* ---------- Calques ---------- */

const Stage: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => {
  const { width, height } = useVideoConfig();
  const c = useCamera();
  return (
    <AbsoluteFill>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${c.ax} ${c.ay}) scale(${c.zoom}) translate(${-c.fx} ${-c.fy})`}>
          {children}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

const Paper: React.FC = () => {
  const { look } = useContext(Sting);
  const { width, height, fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  // Une lumière douce qui glisse lentement sur le papier.
  const lx = lerp(30, 44, Easing.bezier(0.4, 0, 0.2, 1)(phase(t, 0, 5)));
  const ly = lerp(24, 34, Easing.bezier(0.4, 0, 0.2, 1)(phase(t, 0, 5)));
  const uid = useUid();
  return (
    <AbsoluteFill style={{ background: look.plate }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 85% at ${lx}% ${ly}%, ${look.light}, transparent 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 52%, ${look.vignette} 100%)`,
        }}
      />
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, mixBlendMode: look.grainBlend, opacity: look.grain }}
      >
        <filter id={`grain${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={11} stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"
          />
        </filter>
        <rect width={width} height={height} filter={`url(#grain${uid})`} />
      </svg>
    </AbsoluteFill>
  );
};

const Letters: React.FC = () => {
  const { cut, tl, look } = useContext(Sting);
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const uid = useUid();
  const reveal = Easing.bezier(0.16, 1, 0.3, 1);
  // Le mot se resserre doucement autour du « ! » pendant la mise au point.
  const tracking = 1 - Easing.bezier(0.2, 0, 0, 1)(phase(t, cut.lettersStart, cut.trackingDur));
  const nudge = impulse(t - tl.land) * 30;

  return (
    <Stage>
      <g transform={FONT_SPACE}>
        {LETTERS.map((l, i) => {
          const p = phase(t, cut.lettersStart + i * cut.letterStagger, cut.letterDur);
          const e = reveal(p);
          const blur = (1 - e) * 58;
          const spread = (l.x + LETTER_CENTER[l.id] - SLOT_CENTER) * 0.05 * tracking;
          const push = l.id === "L" ? -nudge : l.id === "s" ? nudge : 0;
          return (
            <g
              key={l.id}
              transform={`translate(${l.x + spread + push} ${-(1 - e) * 110})`}
              opacity={Easing.bezier(0.33, 0, 0.2, 1)(clamp01(p / 0.45))}
            >
              {blur > 0.2 ? (
                <filter id={`focus${uid}${l.id}`} x="-60%" y="-30%" width="220%" height="160%">
                  <feGaussianBlur stdDeviation={blur} />
                </filter>
              ) : null}
              <path
                d={l.d}
                fill={look.ink}
                filter={blur > 0.2 ? `url(#focus${uid}${l.id})` : undefined}
              />
            </g>
          );
        })}
      </g>
    </Stage>
  );
};

/**
 * Position de la pointe, inclinaison, hauteur (z : 1 = près de l'objectif,
 * 0 = sur le papier) et opacité de la plume.
 */
const nibPose = (t: number, cut: Cut, tl: Timeline, start: { x: number; y: number }) => {
  // Le vol : elle entre floue, lancée, décrit un arc en ralentissant et se
  // redresse jusqu'à planer juste au-dessus de la place du « ! ».
  const f = phase(t, cut.nibStart, cut.nibFly);
  const p = Easing.bezier(0.2, 0.35, 0.2, 1)(f);
  const H = { x: TIP.x, y: TIP.y - cut.nibHover };
  const C = { x: TIP.x + 150, y: TIP.y - cut.arcLift };
  const u = 1 - p;
  const x = u * u * start.x + 2 * u * p * C.x + p * p * H.x;
  const flyY = u * u * start.y + 2 * u * p * C.y + p * p * H.y;
  // La pose : un temps suspendu, puis elle se plante d'un geste décidé et
  // s'appuie un instant (le choc fait réagir le L et le s).
  const q = power2.in(phase(t, cut.nibStart + cut.nibFly, cut.nibPlant));
  const press = Math.sin(Math.PI * power2.out(phase(t, tl.land, 0.16))) * 34;
  // Penchée à 40° comme pour écrire, elle se redresse avec un léger dépassement.
  const rot = 40 * (1 - backOut(phase(f, 0.05, 0.95), 1.6));
  const opacity = Easing.bezier(0.33, 0, 0.2, 1)(phase(f, 0, cut.nibFadeIn));
  return {
    x,
    y: flyY + q * cut.nibHover + press,
    rot,
    z: lerp(1, 0.12, p) * (1 - q),
    opacity,
  };
};

/** Le départ de la plume, en unités du logo. */
const useNibStart = () => {
  const { cut, tl } = useContext(Sting);
  const { width, height, fps, durationInFrames } = useVideoConfig();
  if (!cut.nibFrom) return { x: TIP.x + 2700, y: TIP.y - 2700 };
  // Un point du cadre, ramené dans le repère du logo par la caméra du moment.
  const c = camera(cut.nibStart, width, height, cut, tl, durationInFrames / fps);
  return {
    x: c.fx + (cut.nibFrom.x * width - c.ax) / c.zoom,
    y: c.fy + (cut.nibFrom.y * height - c.ay) / c.zoom,
  };
};

const NibShape: React.FC<{ readonly fill: string }> = ({ fill }) => (
  <g transform={`${FONT_SPACE} translate(${SLOT.x} ${SLOT.nibY})`}>
    <path d={SLOT.nib} fill={fill} fillRule="evenodd" />
  </g>
);

const NibShadow: React.FC = () => {
  const { cut, tl, look } = useContext(Sting);
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const uid = useUid();
  const start = useNibStart();
  if (t < cut.nibStart) return null;
  const n = nibPose(t, cut, tl, start);
  // L'ombre est sur le papier, décalée vers le bas à droite (lumière en haut à
  // gauche) d'autant plus que la plume est haute : presque rien tant qu'elle est
  // loin, elle se resserre et fonce à l'approche, puis s'efface une fois la
  // plume posée (elle devient de l'encre).
  const blur = 8 + 120 * n.z;
  const opacity =
    0.24 * (1 - n.z) ** 1.5 * look.shadowStrength * (1 - phase(t, tl.land, 0.22));
  if (opacity < 0.001) return null;
  return (
    <Stage>
      <filter id={`shadow${uid}`} x="-120%" y="-50%" width="340%" height="200%">
        <feGaussianBlur stdDeviation={blur} />
      </filter>
      <g
        opacity={opacity}
        filter={`url(#shadow${uid})`}
        transform={`translate(${n.x + 300 * n.z} ${n.y + 360 * n.z}) rotate(${n.rot}) scale(${1 + 0.25 * n.z}) translate(${-TIP.x} ${-TIP.y})`}
      >
        <NibShape fill={look.shadow} />
      </g>
    </Stage>
  );
};

const Nib: React.FC = () => {
  const { cut, tl, look } = useContext(Sting);
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const uid = useUid();
  const start = useNibStart();
  if (t < cut.nibStart) return null;
  const n = nibPose(t, cut, tl, start);
  const scale = 1 + cut.nibDepth * n.z;
  // Hors de la profondeur de champ tant qu'elle est près de l'objectif.
  const defocus = 46 * n.z ** 1.5;
  return (
    <Stage>
      {defocus > 0.2 ? (
        <filter id={`defocus${uid}`} x="-80%" y="-30%" width="260%" height="160%">
          <feGaussianBlur stdDeviation={defocus} />
        </filter>
      ) : null}
      <g
        transform={`translate(${n.x} ${n.y}) rotate(${n.rot}) scale(${scale}) translate(${-TIP.x} ${-TIP.y})`}
        filter={defocus > 0.2 ? `url(#defocus${uid})` : undefined}
        opacity={n.opacity}
      >
        <NibShape fill={look.ink} />
      </g>
    </Stage>
  );
};

const Drop: React.FC = () => {
  const { tl, look } = useContext(Sting);
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const uid = useUid();
  const { drop, k, impact } = tl;
  if (t < drop) return null;

  // La physique du prototype, telle quelle (k < 1 : jouée plus vite).
  const d = SLOT.drop0;
  const start = SLOT.nibY + SLOT.tip.y - d.top; // la goutte pend à la pointe
  const hang = d.top - d.bottom;
  const reach = (hang + start) / hang; // allongement qui amène sa base jusqu'à la ligne
  const swell = power2.out(phase(t, drop, 0.34 * k));
  const stretch =
    t < drop + 0.62 * k
      ? power2.inOut(phase(t, drop + 0.3 * k, 0.3 * k))
      : 1 - power2.out(phase(t, drop + 0.62 * k, 0.14 * k));
  const fall = phase(t, drop + 0.62 * k, 0.14 * k);
  const squash =
    t < drop + 0.84 * k
      ? power2.out(phase(t, impact, 0.08 * k))
      : 1 - elasticOut(phase(t, drop + 0.84 * k, 0.55 * k), 0.4);
  const dy = fall > 0 ? lerp(start, 0, power2.in(fall)) : start;
  const size = 0.1 + 0.9 * swell;
  const sy = size * lerp(1, reach, stretch) * lerp(1, 0.72, squash);
  const sx = size * lerp(1, 0.78, stretch) * lerp(1, 1.26, squash);
  const oy = fall >= 1 ? d.bottom : d.top;

  const rings = [
    { r: power2.out(phase(t, impact, 0.7 * k)), strength: 0.6 },
    { r: power2.out(phase(t, impact + 0.1 * k, 0.8 * k)), strength: 0.28 },
  ];

  return (
    <Stage>
      <filter id={`ring${uid}`} x="-20%" y="-60%" width="140%" height="220%">
        <feGaussianBlur stdDeviation={2.5} />
      </filter>
      <g transform={`${FONT_SPACE} translate(${SLOT.x} 0)`}>
        {rings.map(({ r, strength }, i) =>
          r > 0 && r < 1 ? (
            <ellipse
              key={i}
              cx={d.cx}
              cy={d.bottom}
              rx={lerp(90, 420, r)}
              ry={lerp(20, 80, r)}
              fill="none"
              stroke={look.ink}
              strokeWidth={lerp(10, 2, r)}
              opacity={strength * (1 - r) ** 1.3}
              filter={`url(#ring${uid})`}
            />
          ) : null,
        )}
        <path
          d={SLOT.drop}
          fill={look.ink}
          transform={`translate(0 ${dy}) translate(${d.cx} ${oy}) scale(${sx} ${sy}) translate(${-d.cx} ${-oy})`}
        />
      </g>
    </Stage>
  );
};

/**
 * Le carton des vidéos réseaux : la phrase du site sous le logo, puis la ligne
 * « Pour Windows · gratuit ». Même mise au point que les lettres.
 */
const EndCard: React.FC = () => {
  const { tl, look } = useContext(Sting);
  const { width, height, fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const c = useCamera();
  const logoWidth = LOGO_VIEW.width * c.zoom;
  // Le pied du logo (la ligne de base), sous lequel la phrase se cale.
  const baseline = c.ay + (LOGO_ORIGIN.y - c.fy) * c.zoom;
  const wide = width > height;
  const reveal = Easing.bezier(0.16, 1, 0.3, 1);
  const line = (delay: number) => {
    const p = phase(t, tl.card + delay, 0.9);
    const e = reveal(p);
    return {
      opacity: Easing.bezier(0.33, 0, 0.2, 1)(clamp01(p / 0.5)),
      filter: `blur(${(1 - e) * 10}px)`,
      translate: `0 ${(1 - e) * logoWidth * 0.03}px`,
    };
  };
  return (
    <AbsoluteFill
      style={{
        top: baseline + logoWidth * 0.11,
        bottom: "auto",
        alignItems: "center",
        textAlign: "center",
        color: look.ink,
        gap: logoWidth * 0.045,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontWeight: 400,
          fontSize: logoWidth * (wide ? 0.068 : 0.088),
          lineHeight: 1.02,
          letterSpacing: "-0.022em",
          ...line(0),
        }}
      >
        {wide ? "Une touche, l’idée est posée." : (
          <>
            Une touche,
            <br />
            l’idée est posée.
          </>
        )}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontWeight: 500,
          fontSize: logoWidth * (wide ? 0.03 : 0.04),
          letterSpacing: "0.02em",
          opacity: 0.62,
        }}
      >
        <span style={{ display: "inline-block", ...line(0.18) }}>Pour Windows · gratuit</span>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Flou de mouvement : moyenne de plusieurs instants autour de l'image courante
 * (obturateur centré), additionnés en « plus-lighter ».
 *
 * Le navigateur additionne des couleurs prémultipliées sur 8 bits : chaque
 * échantillon à 1/n arrondit différemment chaque canal, ce qui teinte le
 * résultat (l'ivoire virait au rose). Le calque ne contient qu'une couleur,
 * alors on la réimpose après la somme (seule la couverture compte), et n divise
 * 255 pour que la couverture pleine retombe exactement sur 255.
 * Coûteux : on ne l'active que pendant les mouvements rapides.
 */
const MotionBlur: React.FC<{
  readonly active: boolean;
  readonly color: string;
  readonly samples?: 3 | 5 | 15 | 17;
  readonly shutter?: number;
  readonly children: React.ReactNode;
}> = ({ active, color, samples = 15, shutter = 0.75, children }) => {
  const frame = useCurrentFrame();
  const uid = useUid();
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  return (
    <AbsoluteFill style={{ isolation: "isolate", filter: `url(#tint${uid})` }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={`tint${uid}`} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`}
          />
        </filter>
      </svg>
      {active
        ? Array.from({ length: samples }, (_, i) => (
            <AbsoluteFill
              key={i}
              style={{ mixBlendMode: "plus-lighter", filter: `opacity(${1 / samples})` }}
            >
              <Freeze frame={frame + shutter * (i / (samples - 1) - 0.5)}>{children}</Freeze>
            </AbsoluteFill>
          ))
        : children}
    </AbsoluteFill>
  );
};

export const LogoSting: React.FC<LogoStingProps> = ({ cut: cutName, look: lookName, transparent }) => {
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const cut = CUTS[cutName];
  const tl = timeline(cut);
  const look = LOOKS[lookName];
  return (
    <Sting.Provider value={{ cut, tl, look }}>
      <AbsoluteFill>
        {transparent ? null : <Paper />}
        <Letters />
        <NibShadow />
        <MotionBlur active={t >= cut.nibStart && t < tl.land + 0.03} color={look.ink}>
          <Nib />
        </MotionBlur>
        <MotionBlur
          active={t >= tl.drop + 0.6 * tl.k && t < tl.drop + 1.4 * tl.k}
          color={look.ink}
          samples={5}
          shutter={0.6}
        >
          <Drop />
        </MotionBlur>
        {cut.endCard ? <EndCard /> : null}
      </AbsoluteFill>
    </Sting.Provider>
  );
};

export const LogoStingCompositions: React.FC = () => (
  <>
    {/* Le sting seul (intro, présentation). */}
    <Composition
      id="LogoSting"
      component={LogoSting}
      durationInFrames={300}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "master", look: "paper", transparent: false }}
    />
    <Composition
      id="LogoStingInk"
      component={LogoSting}
      durationInFrames={300}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "master", look: "ink", transparent: false }}
    />
    {/* Le même sur fond transparent, à incruster au montage (WebM avec alpha). */}
    <Composition
      id="LogoStingClear"
      component={LogoSting}
      durationInFrames={300}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "master", look: "paper", transparent: true }}
    />
    <Composition
      id="LogoStingClearInk"
      component={LogoSting}
      durationInFrames={300}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "master", look: "ink", transparent: true }}
    />
    {/* Réseaux : le sting et son carton. */}
    <Composition
      id="SocialWide"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "social", look: "paper", transparent: false }}
    />
    <Composition
      id="SocialWideInk"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ cut: "social", look: "ink", transparent: false }}
    />
    <Composition
      id="SocialSquare"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1080}
      height={1080}
      defaultProps={{ cut: "social", look: "paper", transparent: false }}
    />
    <Composition
      id="SocialSquareInk"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1080}
      height={1080}
      defaultProps={{ cut: "social", look: "ink", transparent: false }}
    />
    <Composition
      id="SocialVertical"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={{ cut: "social", look: "paper", transparent: false }}
    />
    <Composition
      id="SocialVerticalInk"
      component={LogoSting}
      durationInFrames={390}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={{ cut: "social", look: "ink", transparent: false }}
    />
    {/* L'écran d'ouverture de l'app, thèmes clair et sombre (WebM avec alpha). */}
    <Composition
      id="SplashLight"
      component={LogoSting}
      durationInFrames={120}
      fps={60}
      width={1600}
      height={900}
      defaultProps={{ cut: "splash", look: "appLight", transparent: true }}
    />
    <Composition
      id="SplashDark"
      component={LogoSting}
      durationInFrames={120}
      fps={60}
      width={1600}
      height={900}
      defaultProps={{ cut: "splash", look: "appDark", transparent: true }}
    />
  </>
);
