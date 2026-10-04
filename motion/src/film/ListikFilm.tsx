/*
 * Le film de présentation de Listik (≈ 76 s, 16:9, 60 i/s).
 *
 * L'interface n'est pas filmée : ce sont de vraies captures de l'app (×3, voir
 * public/film/), animées ici — caméra, ouvertures de liste, frappe. Seules la
 * barre de capture et sa frappe sont redessinées, avec les styles relevés sur
 * le DOM réel (police système, couleurs des jetons, rayons).
 *
 * Tout le montage se cale sur `timing.ts` (mesures de la musique).
 */
import { Audio } from "@remotion/media";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { LogoSting } from "../LogoSting";
import { clamp01, lerp, phase } from "../ease";
import { BEATS, END, FPS, LEAD, SHOTS, bar, beat, f } from "./timing";

const INK = "#1d2220";
const MUTED = "#5f6863";
const PAPER = "#f7f4ec";
const DISPLAY = "Fraunces, Georgia, serif";
const BODY = "'DM Sans', system-ui, sans-serif";
/** La police de l'interface de Listik sous Windows (system-ui). */
const UI = "'Segoe UI', system-ui, sans-serif";

const out = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const soft = Easing.bezier(0.4, 0, 0.2, 1);

type Props = { readonly debug: boolean };

/** Temps absolu du film dans une scène montée en `<Sequence from>`. */
const useFilmTime = (start: number) => {
  const { fps } = useVideoConfig();
  return start + useCurrentFrame() / fps;
};

/* ------------------------------------------------------------------ */
/* Éléments communs                                                     */
/* ------------------------------------------------------------------ */

const Paper: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <AbsoluteFill
      style={{ background: "radial-gradient(ellipse 75% 85% at 32% 26%, rgba(255,253,247,.8), transparent 62%)" }}
    />
    <AbsoluteFill
      style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 55%, rgba(96,80,52,.10) 100%)" }}
    />
  </AbsoluteFill>
);

/** Un texte qui fait sa mise au point (flou → net) en montant légèrement, comme les lettres du logo. */
const Focus: React.FC<{
  readonly t: number;
  readonly at: number;
  readonly dur?: number;
  readonly out?: number;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}> = ({ t, at, dur = 0.8, out: leave, children, style }) => {
  const p = out(phase(t, at, dur));
  const q = leave === undefined ? 0 : inOut(phase(t, leave, 0.35));
  return (
    <div
      style={{
        opacity: clamp01(p * 1.6) * (1 - q),
        filter: `blur(${(1 - p) * 10 + q * 6}px)`,
        translate: `0 ${(1 - p) * 22 - q * 12}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Colonne de texte à gauche des fenêtres (scènes 4 à 7). */
const Side: React.FC<{ readonly children: ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      top: 0,
      bottom: 0,
      width: 430,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 22,
      color: INK,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ readonly children: ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 74, lineHeight: 1.02, letterSpacing: "-0.02em" }}>
    {children}
  </div>
);

const Sub: React.FC<{ readonly children: ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: 27, lineHeight: 1.4, color: MUTED }}>{children}</div>
);

/** La fenêtre de l'app : 1200 × 800 unités CSS de l'app, affichée à droite. */
const WIN = { left: 590, top: 128, width: 1236 };
const K = WIN.width / 1200; // pixels du film par pixel CSS de l'app
const WIN_H = 800 * K;

const Window: React.FC<{
  readonly children: ReactNode;
  /** Caméra dans la fenêtre : zoom autour d'un point (unités CSS de l'app). */
  readonly zoom?: number;
  readonly focus?: { x: number; y: number };
  readonly style?: CSSProperties;
}> = ({ children, zoom = 1, focus = { x: 600, y: 400 }, style }) => (
  <div
    style={{
      position: "absolute",
      left: WIN.left,
      top: WIN.top,
      width: WIN.width,
      height: WIN_H,
      borderRadius: 18,
      overflow: "hidden",
      background: "#f7f6f2",
      boxShadow: "0 2px 4px rgba(20,24,22,.06), 0 60px 110px -46px rgba(20,24,22,.5)",
      outline: "1px solid rgba(29,34,32,.08)",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        transformOrigin: `${focus.x * K}px ${focus.y * K}px`,
        scale: String(zoom),
      }}
    >
      {children}
    </div>
    {/* Quand la caméra s'approche, le bord gauche coupe la barre latérale en
        plein mot : un fondu dans la couleur du fond de l'app l'adoucit. */}
    {zoom > 1.01 && (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 240,
          background: "linear-gradient(90deg, rgb(248,246,242) 35%, rgba(248,246,242,0))",
          opacity: clamp01((zoom - 1) / 0.12),
        }}
      />
    )}
  </div>
);

/** Une capture plein cadre dans la fenêtre. */
const Plate: React.FC<{ readonly name: string; readonly style?: CSSProperties }> = ({ name, style }) => (
  <Img
    src={staticFile(`film/${name}.png`)}
    style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", ...style }}
  />
);

/** Une capture découpée en bande horizontale (y en unités CSS), éventuellement décalée. */
const Band: React.FC<{
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly dy?: number;
  readonly style?: CSSProperties;
}> = ({ name, from, to, dy = 0, style }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: from * K + dy * K,
      height: (to - from) * K,
      overflow: "hidden",
      ...style,
    }}
  >
    <Img
      src={staticFile(`film/${name}.png`)}
      style={{ position: "absolute", left: 0, top: -from * K, width: WIN.width, height: WIN_H }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/* 1. L'idée arrive                                                     */
/* ------------------------------------------------------------------ */

const Hook: React.FC = () => {
  const t = useFilmTime(SHOTS.hook.from);
  const phrase = "Une idée.";
  const typed = Math.max(0, Math.min(phrase.length, Math.floor((t - 0.7) / 0.085)));
  const typing = t > 0.7 && typed < phrase.length;
  const caret = typing || Math.floor(t * 2.2) % 2 === 0;
  const leave = inOut(phase(t, bar(0) - 0.42, 0.42));
  return (
    <AbsoluteFill>
      <Paper />
      {/* Ce sur quoi on travaillait : un document, flou derrière l'idée. */}
      <div
        style={{
          position: "absolute",
          left: 380,
          top: 150,
          width: 1160,
          height: 780,
          borderRadius: 20,
          background: "#fffdf8",
          boxShadow: "0 40px 90px -50px rgba(0,0,0,.35)",
          padding: "90px 110px",
          display: "grid",
          alignContent: "start",
          gap: 30,
          filter: "blur(7px)",
          opacity: 0.6 * (1 - leave),
          scale: String(lerp(1.0, 1.05, soft(phase(t, 0, 5)))),
        }}
      >
        {[62, 92, 84, 70, 88, 46, 80, 66].map((w, i) => (
          <div key={i} style={{ height: 22, width: `${w}%`, borderRadius: 11, background: "#d8d3c7" }} />
        ))}
      </div>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          opacity: 1 - leave,
          scale: String(lerp(1, 0.9, leave)),
          filter: `blur(${leave * 12}px)`,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: 138, letterSpacing: "-0.02em", color: INK, lineHeight: 1 }}>
          {phrase.slice(0, typed)}
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 112,
              marginLeft: 8,
              verticalAlign: -14,
              background: INK,
              opacity: caret ? 1 : 0,
            }}
          />
        </div>
        <Focus t={t} at={2.35} style={{ fontFamily: BODY, fontSize: 38, color: MUTED }}>
          Au mauvais moment.
        </Focus>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 2. Le geste : Alt + Q                                                */
/* ------------------------------------------------------------------ */

const Key: React.FC<{ readonly label: string; readonly width: number; readonly press: number }> = ({
  label,
  width,
  press,
}) => (
  <div
    style={{
      width,
      height: 210,
      borderRadius: 44,
      background: "linear-gradient(180deg, #fffefa 0%, #f6f2e8 100%)",
      border: "1px solid rgba(29,34,32,.14)",
      display: "grid",
      placeItems: "center",
      fontFamily: BODY,
      fontWeight: 600,
      fontSize: 70,
      color: INK,
      translate: `0 ${press * 12}px`,
      boxShadow: `0 ${lerp(14, 3, press)}px 0 rgba(29,34,32,.16), 0 ${lerp(50, 22, press)}px ${lerp(80, 40, press)}px -36px rgba(0,0,0,.42)`,
    }}
  >
    {label}
  </div>
);

const Keys: React.FC = () => {
  const start = bar(0) - 0.45;
  const t = useFilmTime(start);
  const enter = out(phase(t, start, 0.42));
  // Enfoncées sur le premier temps fort, relâchées avec un léger rebond.
  const down = phase(t, bar(0) - 0.05, 0.05);
  const up = Easing.bezier(0.34, 1.56, 0.64, 1)(phase(t, bar(0) + 0.12, 0.3));
  const press = Math.max(0, down - up);
  const ring = phase(t, bar(0), 1.1);
  const leave = inOut(phase(t, bar(2) - 0.4, 0.4));
  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {ring > 0 && ring < 1 && (
          <div
            style={{
              position: "absolute",
              width: lerp(200, 1500, out(ring)),
              height: lerp(200, 1500, out(ring)),
              borderRadius: "50%",
              border: `${lerp(3, 1, ring)}px solid ${INK}`,
              opacity: 0.22 * (1 - ring),
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 46,
            opacity: enter * (1 - leave),
            scale: String(lerp(0.86, 1, enter) * lerp(1, 0.9, leave)),
            translate: `0 ${lerp(40, 0, enter) - leave * 90}px`,
            filter: `blur(${leave * 8}px)`,
          }}
        >
          <Key label="Alt" width={270} press={press} />
          <div style={{ fontFamily: BODY, fontWeight: 300, fontSize: 64, color: "#8b928e" }}>+</div>
          <Key label="Q" width={210} press={press} />
        </div>
        <div style={{ position: "absolute", top: 760, opacity: 1 - leave }}>
          <Focus t={t} at={beat(2)} style={{ fontFamily: DISPLAY, fontSize: 52, color: INK }}>
            Depuis n’importe quelle fenêtre.
          </Focus>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 3. La capture                                                        */
/* ------------------------------------------------------------------ */

/** La barre de capture : la capture réelle de la fenêtre (vide) + la frappe redessinée. */
const BAR = { plateW: 1800, cssW: 640, cssH: 164 };
const S = BAR.plateW / BAR.cssW; // pixels du film par pixel CSS de la fenêtre rapide

type Tok = { text: string; kind?: "date" | "project" | "prio"; label?: string };
const PHRASE: Tok[] = [
  { text: "Réserver l'hôtel " },
  { text: "vendredi", kind: "date", label: "Date" },
  { text: " " },
  { text: "#lisbonne", kind: "project", label: "Projet" },
  { text: " " },
  { text: "!", kind: "prio", label: "Priorité" },
];
// Couleurs relevées sur le DOM de la fenêtre rapide (Tailwind 4 : blue/violet/rose-500).
const TOKEN = {
  date: { color: "oklch(0.623 0.214 259.8)", bg: "oklch(0.623 0.214 259.8 / 0.12)" },
  project: { color: "oklch(0.606 0.25 292.7)", bg: "oklch(0.606 0.25 292.7 / 0.12)" },
  prio: { color: "oklch(0.645 0.246 16.4)", bg: "oklch(0.645 0.246 16.4 / 0.12)" },
};

const Capture: React.FC = () => {
  const start = SHOTS.capture.from;
  const t = useFilmTime(start);
  const enter = out(phase(t, start - 0.05, 0.5));
  const typeStart = beat(9);
  const perChar = 0.068;
  const total = PHRASE.reduce((n, p) => n + p.text.length, 0);
  const typed = Math.max(0, Math.min(total, Math.floor((t - typeStart) / perChar)));
  const enterKey = beat(23); // Entrée sur le dernier temps de la mesure 5
  const pressed = phase(t, enterKey, 0.12);
  const gone = inOut(phase(t, enterKey + 0.08, 0.38));
  const labels = out(phase(t, bar(5) - 0.1, 0.6));
  const caretOn = typed < total || Math.floor(t * 2.2) % 2 === 0;

  let consumed = 0;
  const top = 470 - 82 * S;
  return (
    <AbsoluteFill>
      <Paper />
      {/* Le bureau, flou, derrière la fenêtre rapide. */}
      <Img
        src={staticFile("film/today.png")}
        style={{
          position: "absolute",
          inset: -60,
          width: 2040,
          height: 1200,
          objectFit: "cover",
          filter: "blur(16px) saturate(.85)",
          opacity: 0.5,
          scale: String(lerp(1.06, 1.0, soft(phase(t, start, 8)))),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: (1920 - BAR.plateW) / 2,
          top,
          width: BAR.plateW,
          height: BAR.cssH * S,
          opacity: enter * (1 - gone),
          translate: `0 ${lerp(-50, 0, enter) - gone * 40}px`,
          scale: String(lerp(0.97, 1, enter) * lerp(1, 0.985, Math.sin(Math.PI * pressed)) * lerp(1, 0.94, gone)),
          filter: `blur(${gone * 6}px)`,
        }}
      >
        <Img src={staticFile("film/quick-empty.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        {/* Dès la première lettre, l'indication « Capturer une tâche… » s'efface, comme dans l'app. */}
        {typed > 0 && (
          <div style={{ position: "absolute", left: 104 * S, top: 64 * S, width: 470 * S, height: 36 * S, background: "rgb(255,254,251)" }} />
        )}
        {/* La frappe, à l'emplacement exact du champ (x 110, y 70, 16 px). */}
        <div
          style={{
            position: "absolute",
            left: 110 * S,
            top: 70 * S,
            height: 24 * S,
            display: "flex",
            alignItems: "center",
            whiteSpace: "pre",
            fontFamily: UI,
            fontSize: 16 * S,
            color: "#251f1b",
          }}
        >
          {PHRASE.map((tok, i) => {
            const shown = tok.text.slice(0, Math.max(0, typed - consumed));
            const complete = typed >= consumed + tok.text.length;
            const doneAt = typeStart + (consumed + tok.text.length) * perChar;
            consumed += tok.text.length;
            if (!shown) return null;
            if (!tok.kind) return <span key={i}>{shown}</span>;
            const pop = complete ? out(phase(t, doneAt, 0.35)) : 0;
            const c = TOKEN[tok.kind];
            return (
              <span
                key={i}
                style={{
                  position: "relative",
                  borderRadius: 6 * S,
                  padding: `0 ${2.88 * S}px`,
                  background: complete ? c.bg : "transparent",
                  color: complete ? c.color : "#251f1b",
                  opacity: 1,
                  scale: String(1 + 0.08 * Math.sin(Math.PI * pop)),
                  display: "inline-block",
                }}
              >
                {shown}
                {tok.label && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 30 * S,
                      translate: `-50% ${lerp(12, 0, labels)}px`,
                      opacity: labels,
                      fontFamily: BODY,
                      fontWeight: 500,
                      fontSize: 24,
                      letterSpacing: "0.04em",
                      color: c.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ display: "block", width: 1.5, height: 28, background: c.color, opacity: 0.5, margin: "0 auto 8px" }} />
                    {tok.label}
                  </span>
                )}
              </span>
            );
          })}
          <span
            style={{
              display: "inline-block",
              width: 2 * S * 0.6,
              height: 21 * S,
              marginLeft: 2,
              background: "#251f1b",
              opacity: caretOn ? 1 : 0,
            }}
          />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 820, textAlign: "center", opacity: 1 - gone }}>
        <Focus t={t} at={bar(3) + 0.1} style={{ fontFamily: DISPLAY, fontSize: 58, color: INK, letterSpacing: "-0.01em" }}>
          Écrivez comme vous parlez.
        </Focus>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 4. Rangée à sa place (À venir)                                       */
/* ------------------------------------------------------------------ */

const ROW = { from: 126, to: 196, pitch: 70 };

const Land: React.FC = () => {
  const start = SHOTS.land.from;
  const t = useFilmTime(start);
  const enter = out(phase(t, start, 0.5));
  const fly = inOut(phase(t, start + 0.25, 0.6));
  const landed = t >= start + 0.85;
  const glow = landed ? 1 - phase(t, start + 0.85, 1.4) : 0;
  const zoom = lerp(1.32, 1.0, soft(phase(t, start + 0.9, 2.6)));
  return (
    <AbsoluteFill>
      <Paper />
      <Side>
        <Focus t={t} at={start + 0.2}>
          <Title>Rangée à sa place.</Title>
        </Focus>
        <Focus t={t} at={start + 0.45}>
          <Sub>« vendredi » : planifiée le 9 octobre. « #lisbonne » : dans son projet. « ! » : prioritaire.</Sub>
        </Focus>
      </Side>
      <Window zoom={zoom} focus={{ x: 640, y: 150 }} style={{ opacity: enter, translate: `${lerp(40, 0, enter)}px 0` }}>
        {landed ? (
          <Plate name="upcoming-after" />
        ) : (
          <>
            {/* La liste s'ouvre : tout ce qui est sous la nouvelle ligne descend d'une rangée. */}
            <Band name="upcoming-before" from={0} to={ROW.from} />
            <Band name="upcoming-before" from={ROW.from} to={800 - ROW.pitch} dy={fly * ROW.pitch} />
          </>
        )}
        {/* La ligne qui arrive de la fenêtre rapide. */}
        {!landed && (
          <Band
            name="upcoming-after"
            from={ROW.from}
            to={ROW.to}
            dy={lerp(-150, 0, fly)}
            style={{ opacity: clamp01(fly * 2.5), filter: `blur(${(1 - fly) * 6}px)` }}
          />
        )}
        {glow > 0 && (
          <div
            style={{
              position: "absolute",
              left: 392 * K,
              top: ROW.from * K,
              width: 672 * K,
              height: (ROW.to - ROW.from) * K,
              borderRadius: 12,
              background: `rgba(15,138,132,${0.12 * glow})`,
            }}
          />
        )}
      </Window>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 5. Le planificateur                                                  */
/* ------------------------------------------------------------------ */

const PLANNER = [
  { plate: "today", title: "Aujourd’hui", sub: "Ce qui compte maintenant, et ce qui est en retard." },
  { plate: "anytime", title: "Quand je peux", sub: "Sans date, mais pas oublié." },
  { plate: "someday", title: "Un jour", sub: "Les envies, rangées pour plus tard." },
  { plate: "project-launch", title: "Vos projets", sub: "Domaines, projets, avancement." },
  { plate: "project-lisbonne", title: "Vos projets", sub: "Domaines, projets, avancement." },
];

const Planner: React.FC = () => {
  const start = SHOTS.planner.from;
  const t = useFilmTime(start);
  const i = Math.max(0, Math.min(PLANNER.length - 1, PLANNER.findIndex((_, k) => t < bar(9 + k))));
  const idx = t >= bar(12) ? 4 : i;
  const cur = PLANNER[idx];
  const segStart = bar(8 + idx);
  const cut = phase(t, segStart, 0.12);
  const titleChanged = idx === 0 || PLANNER[idx - 1].title !== cur.title;
  return (
    <AbsoluteFill>
      <Paper />
      <Side>
        <Focus t={t} at={titleChanged ? segStart : bar(8 + idx - 1)} key={cur.title}>
          <Title>{cur.title}</Title>
        </Focus>
        <Focus t={t} at={(titleChanged ? segStart : bar(8 + idx - 1)) + 0.15} key={cur.sub}>
          <Sub>{cur.sub}</Sub>
        </Focus>
      </Side>
      <Window zoom={lerp(1.0, 1.05, soft(phase(t, segStart, bar(9) - bar(8))))} focus={{ x: 720, y: 260 }}>
        {idx > 0 && cut < 1 ? <Plate name={PLANNER[idx - 1].plate} /> : null}
        <Plate name={cur.plate} style={{ opacity: idx === 0 ? 1 : cut }} />
      </Window>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 6. Le journal                                                        */
/* ------------------------------------------------------------------ */

const JOURNAL_NEW = { from: 377, to: 409, shift: 38 };

const Journal: React.FC = () => {
  const start = SHOTS.journal.from;
  const t = useFilmTime(start);
  const cardIn = out(phase(t, bar(14), 0.5));
  const cardOut = inOut(phase(t, bar(16) - 0.1, 0.4));
  const typeP = phase(t, bar(14) + 0.35, bar(15) + 0.9 - (bar(14) + 0.35));
  const open = inOut(phase(t, bar(16) + 0.15, 0.55));
  const landed = t >= bar(16) + 0.7;
  const glow = landed ? 1 - phase(t, bar(16) + 0.7, 1.6) : 0;
  const zoom = lerp(1.0, 1.28, soft(phase(t, bar(16), 1.6)));
  return (
    <AbsoluteFill>
      <Paper />
      <Side>
        <Focus t={t} at={start + 0.1}>
          <Title>Le journal</Title>
        </Focus>
        <Focus t={t} at={start + 0.3}>
          <Sub>Une pensée, au même geste : elle rejoint la page du jour, à son heure.</Sub>
        </Focus>
      </Side>
      <Window zoom={zoom} focus={{ x: 700, y: 330 }}>
        {landed ? (
          <Plate name="journal-after" />
        ) : (
          <>
            <Band name="journal-before" from={0} to={JOURNAL_NEW.from} />
            <Band name="journal-before" from={JOURNAL_NEW.from} to={800 - JOURNAL_NEW.shift} dy={open * JOURNAL_NEW.shift} />
            <Band
              name="journal-after"
              from={JOURNAL_NEW.from}
              to={JOURNAL_NEW.to}
              style={{ opacity: open, filter: `blur(${(1 - open) * 4}px)` }}
            />
          </>
        )}
        {glow > 0 && (
          <div
            style={{
              position: "absolute",
              left: 352 * K,
              top: JOURNAL_NEW.from * K,
              width: 660 * K,
              height: (JOURNAL_NEW.to - JOURNAL_NEW.from) * K,
              borderRadius: 10,
              background: `rgba(15,138,132,${0.12 * glow})`,
            }}
          />
        )}
      </Window>
      {/* La fenêtre rapide en mode Journal, par-dessus. */}
      {cardIn > 0 && cardOut < 1 && (
        <div
          style={{
            position: "absolute",
            left: 1180,
            top: 470,
            width: 680,
            height: 600,
            borderRadius: 22,
            overflow: "hidden",
            boxShadow: "0 50px 100px -40px rgba(0,0,0,.45)",
            opacity: cardIn * (1 - cardOut),
            translate: `${lerp(30, 0, cardIn) - cardOut * 120}px ${lerp(40, 0, cardIn) - cardOut * 60}px`,
            scale: String(lerp(0.96, 1, cardIn) * lerp(1, 0.8, cardOut)),
            filter: `blur(${cardOut * 6}px)`,
          }}
        >
          {/* La page blanche de la fenêtre, puis le texte qui s'écrit (dévoilé de gauche à droite). */}
          <Img src={staticFile("film/quick-journal.png")} style={{ position: "absolute", inset: 0, width: 680, height: 600, clipPath: "inset(0 0 calc(100% - 115px) 0)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 115, bottom: 0, background: "#fffdf8" }} />
          <Img
            src={staticFile("film/quick-journal.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: 680,
              height: 600,
              clipPath: `inset(115px ${(1 - typeP) * 100}% calc(100% - 150px) 0)`,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 7. L'assistant                                                       */
/* ------------------------------------------------------------------ */

const Assistant: React.FC = () => {
  const start = SHOTS.assistant.from;
  const t = useFilmTime(start);
  const ask = out(phase(t, start + 0.4, 0.5));
  const answered = t >= bar(19);
  // La réponse s'écrit de haut en bas (y de 140 à 540, unités CSS).
  const reveal = soft(phase(t, bar(19), bar(21) - bar(19)));
  const zoom = lerp(1.0, 1.16, soft(phase(t, bar(19), 4)));
  return (
    <AbsoluteFill>
      <Paper />
      <Side>
        <Focus t={t} at={start + 0.1}>
          <Title>L’assistant</Title>
        </Focus>
        <Focus t={t} at={start + 0.3}>
          <Sub>Celui que vous utilisez déjà : Claude Code, Codex, OpenCode. Il lit vos tâches, il ne les supprime jamais.</Sub>
        </Focus>
      </Side>
      <Window zoom={zoom} focus={{ x: 720, y: 280 }}>
        {!answered ? (
          <>
            <Plate name="assistant-empty" />
            <Band
              name="assistant-answer-2"
              from={86}
              to={132}
              dy={lerp(560, 0, ask)}
              style={{ opacity: ask, clipPath: "inset(0 0 0 68%)" }}
            />
          </>
        ) : (
          <>
            <Band name="assistant-answer-2" from={0} to={140} />
            <Band name="assistant-answer-2" from={140} to={140 + 400 * reveal} />
            <Band name="assistant-answer-2" from={700} to={800} />
          </>
        )}
      </Window>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 8. Chez vous                                                         */
/* ------------------------------------------------------------------ */

const Local: React.FC = () => {
  const start = SHOTS.local.from;
  const t = useFilmTime(start);
  const leave = bar(29) + 0.3;
  const lock = out(phase(t, start + 0.2, 0.8));
  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, textAlign: "center" }}>
        <svg
          width="92"
          height="92"
          viewBox="0 0 24 24"
          fill="none"
          stroke={INK}
          strokeWidth="1.2"
          strokeLinecap="round"
          style={{ opacity: lock * (1 - inOut(phase(t, leave, 0.6))), marginBottom: 10 }}
        >
          <rect x="5" y="10.5" width="14" height="10" rx="2.6" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lock} />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lock} />
        </svg>
        <Focus t={t} at={start + 0.35} out={leave} style={{ fontFamily: DISPLAY, fontSize: 80, color: INK, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          Vos données restent
          <br />
          sur votre ordinateur.
        </Focus>
        <Focus t={t} at={bar(25)} out={leave + 0.08} style={{ fontFamily: BODY, fontSize: 36, color: MUTED }}>
          Pas de compte. Pas d’abonnement.
        </Focus>
        <Focus t={t} at={bar(27)} out={leave + 0.16} style={{ fontFamily: BODY, fontSize: 36, color: MUTED }}>
          Gratuit et open source.
        </Focus>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* 9. La signature et la fin                                            */
/* ------------------------------------------------------------------ */

const Url: React.FC = () => {
  const t = useFilmTime(bar(33));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 92 }}>
      <Focus t={t} at={bar(33)} style={{ fontFamily: BODY, fontWeight: 500, fontSize: 26, color: MUTED, letterSpacing: "0.04em" }}>
        darildivin.github.io/Listik
      </Focus>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Repères de synchronisation (prop `debug`)                           */
/* ------------------------------------------------------------------ */

const Debug: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const k = BEATS.findIndex((b) => b + LEAD > t) - 1;
  const sinceBeat = k >= 0 ? t - (BEATS[k] + LEAD) : 1;
  const barIndex = Math.floor(k / 4);
  const shot = Object.entries(SHOTS).find(([, s]) => t >= s.from && t < s.to)?.[0] ?? "";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 20, top: 20, padding: "8px 14px", background: "rgba(0,0,0,.75)", color: "#fff", fontFamily: "monospace", fontSize: 24, borderRadius: 8 }}>
        {t.toFixed(2)} s · mesure {barIndex} · temps {k % 4} · {shot}
      </div>
      <div
        style={{
          position: "absolute",
          right: 30,
          top: 26,
          width: 30,
          height: 30,
          borderRadius: 15,
          background: k % 4 === 0 ? "#e5484d" : "#1d2220",
          opacity: sinceBeat < 0.12 ? 1 : 0.15,
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Le film                                                              */
/* ------------------------------------------------------------------ */

const seq = (s: { from: number; to: number }) => ({
  from: f(s.from),
  durationInFrames: f(s.to) - f(s.from),
});

export const ListikFilm: React.FC<Props> = ({ debug }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Sequence {...seq(SHOTS.hook)} premountFor={FPS}>
        <Hook />
      </Sequence>
      <Sequence from={f(bar(0) - 0.45)} durationInFrames={f(bar(2)) - f(bar(0) - 0.45)} premountFor={FPS}>
        <Keys />
      </Sequence>
      <Sequence {...seq(SHOTS.capture)} premountFor={FPS}>
        <Capture />
      </Sequence>
      <Sequence {...seq(SHOTS.land)} premountFor={FPS}>
        <Land />
      </Sequence>
      <Sequence {...seq(SHOTS.planner)} premountFor={FPS}>
        <Planner />
      </Sequence>
      <Sequence {...seq(SHOTS.journal)} premountFor={FPS}>
        <Journal />
      </Sequence>
      <Sequence {...seq(SHOTS.assistant)} premountFor={FPS}>
        <Assistant />
      </Sequence>
      <Sequence {...seq(SHOTS.local)} premountFor={FPS}>
        <Local />
      </Sequence>
      <Sequence {...seq(SHOTS.sting)} premountFor={FPS}>
        <LogoSting cut="social" look="paper" transparent={false} />
      </Sequence>
      <Sequence from={f(bar(33))} durationInFrames={f(END) - f(bar(33))} premountFor={FPS}>
        <Url />
      </Sequence>
      <Audio
        src={staticFile("audio/minimal-paulyudin.mp3")}
        from={f(LEAD)}
        volume={(mediaFrame) => {
          const ft = mediaFrame / FPS + LEAD; // temps du film
          return (
            interpolate(ft, [LEAD, LEAD + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
            interpolate(ft, [bar(34), END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          );
        }}
      />
      {debug && t < END ? <Debug /> : null}
    </AbsoluteFill>
  );
};

export const FilmCompositions: React.FC = () => (
  <>
    <Composition
      id="ListikFilm"
      component={ListikFilm}
      durationInFrames={4587}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ debug: false }}
    />
    <Composition
      id="ListikFilmDebug"
      component={ListikFilm}
      durationInFrames={4587}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ debug: true }}
    />
  </>
);
