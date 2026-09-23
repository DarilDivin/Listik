"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { emit, listen } from "@tauri-apps/api/event";

/** Accents premium disponibles (classes `[data-accent]` dans globals.css). */
export const ACCENTS = [
  { id: "teal", label: "Sarcelle" },
  { id: "indigo", label: "Indigo" },
  { id: "violet", label: "Violet" },
  { id: "coral", label: "Corail" },
  { id: "amber", label: "Ambre" },
  { id: "rose", label: "Rose" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type NavStyle = "dock" | "sidebar";

/** Groupes du planner — un jeu de préférences de mise en forme par groupe. */
export type SectionKey =
  | "overdue"
  | "today"
  | "routines"
  | "evening"
  | "tomorrow"
  | "upcoming"
  | "inbox"
  | "anytime"
  | "someday"
  | "completed";

/** Les 6 pistes explorées pour les sections qui débordent, plus la liste classique. */
export const SECTION_STYLES = [
  { id: "list", label: "Liste" },
  { id: "horizon", label: "Horizon" },
  { id: "zoom", label: "Zoom sémantique" },
  { id: "strata", label: "Stratigraphie" },
  { id: "loupe", label: "Loupe" },
  { id: "portal", label: "Portail" },
] as const;

export type SectionStyleId = (typeof SECTION_STYLES)[number]["id"];

/**
 * Styles compatibles par section : le zoom sémantique n'a de sens que pour une
 * section qui s'étale sur plusieurs jours/semaines futurs (À venir), la
 * stratigraphie que pour un historique de tâches terminées (Terminées).
 * Horizon/Loupe/Portail sont génériques et proposés partout.
 *
 * Débranché (Phase O) : les 5 styles autres que « list » ne sont plus
 * sélectionnables depuis l'interface (voir `SECTION_STYLES_LOCKED`
 * ci-dessous, seule table réellement consultée par le rendu). Conservé tel
 * quel — candidat explicite à une vraie refonte en Phase S.
 */
export const SECTION_STYLE_OPTIONS: Record<SectionKey, SectionStyleId[]> = {
  overdue: ["list", "horizon", "loupe", "portal"],
  today: ["list", "horizon", "loupe", "portal"],
  routines: ["list", "horizon", "loupe", "portal"],
  evening: ["list", "horizon", "loupe", "portal"],
  tomorrow: ["list", "horizon", "loupe", "portal"],
  upcoming: ["list", "horizon", "zoom", "loupe", "portal"],
  inbox: ["list", "horizon", "loupe", "portal"],
  anytime: ["list", "horizon", "loupe", "portal"],
  someday: ["list", "horizon", "loupe", "portal"],
  completed: ["list", "horizon", "strata", "loupe", "portal"],
};

/**
 * Mise en forme effective de chaque section — verrouillée sur « Liste »
 * (Phase O) : le sélecteur par section a été retiré, aucune section ne peut
 * plus résoudre à un autre style. Exportée (au lieu d'un simple littéral)
 * pour que `SectionCard` continue de dériver son style PAR section, comme
 * avant — seule la source a changé, plus une préférence, une table figée.
 */
export const SECTION_STYLES_LOCKED: Record<SectionKey, SectionStyleId> = {
  overdue: "list",
  today: "list",
  routines: "list",
  evening: "list",
  tomorrow: "list",
  upcoming: "list",
  inbox: "list",
  anytime: "list",
  someday: "list",
  completed: "list",
};

/**
 * Traitements du widget de progression du Planificateur. Quatre finis, un seul
 * endroit : c'est la leçon des styles de section (six styles × dix sections,
 * débranchés en Phase O faute d'être tenables). Ici la combinatoire est nulle.
 */
export const PULSE_STYLES = [
  { id: "ring", label: "Anneau" },
  { id: "dial", label: "Cadran" },
  { id: "bar", label: "Barre" },
  { id: "countdown", label: "Compte" },
] as const;

export type PulseStyleId = (typeof PULSE_STYLES)[number]["id"];

/** Les présences possibles de la bulle qui accompagne la réflexion de l’Assistant. */
export const REFLECTION_STYLES = [
  { id: "fusion", label: "Fusion", description: "Des idées qui se rejoignent" },
  { id: "souffle", label: "Souffle", description: "Une lumière qui respire" },
  { id: "soie", label: "Soie", description: "Le fil de la pensée" },
  { id: "lucioles", label: "Lucioles", description: "De petites intuitions" },
  { id: "maree", label: "Marée", description: "Une pensée en mouvement" },
  { id: "eclipse", label: "Éclipse", description: "La lumière se déplace" },
  { id: "petales", label: "Pétales", description: "Une idée qui s’ouvre" },
  { id: "constellation", label: "Constellation", description: "Relier les idées" },
  { id: "mercure", label: "Mercure", description: "Une matière vivante" },
  { id: "ruban", label: "Ruban", description: "Une pensée qui chemine" },
  { id: "empreinte", label: "Empreinte", description: "Des contours qui se répondent" },
  { id: "braise", label: "Braise", description: "Une intuition qui s’allume" },
] as const;

export type ReflectionStyleId = (typeof REFLECTION_STYLES)[number]["id"];

const ACCENT_KEY = "listik.accent";
const NAV_KEY = "listik.nav";
const OLED_KEY = "listik.oled";
const PULSE_KEY = "listik.pulse";
const REFLECTION_KEY = "listik.reflection";
const DEFAULT_ACCENT: AccentId = "teal";
const DEFAULT_NAV: NavStyle = "dock";
// L'anneau reste le défaut : il est la signature de la page et du dock, et
// changer ce qu'un utilisateur voit déjà n'est pas au programme d'un réglage
// qui sert justement à lui laisser le choix.
const DEFAULT_PULSE: PulseStyleId = "ring";
// Fusion est née avec les pastilles de la fenêtre rapide : c’est le choix
// naturel tant qu’aucune préférence n’a été explicitement posée.
const DEFAULT_REFLECTION: ReflectionStyleId = "fusion";

type SharedQuickPrefs = {
  accent?: AccentId;
  oled?: boolean;
  reflection?: ReflectionStyleId;
};

const QUICK_PREFS_REQUEST = "listik:ui-prefs-request";
const QUICK_PREFS_SYNC = "listik:ui-prefs-sync";

/** La fenêtre rapide est un WebView distinct : le stockage WebView2 peut être
 * isolé. Les événements Tauri rendent donc la préférence d’accent explicite,
 * plutôt que de dépendre de `storage` entre deux fenêtres. */
function publishQuickPrefs(preferences: SharedQuickPrefs) {
  void emit(QUICK_PREFS_SYNC, preferences).catch(() => {
    // En navigateur (tests, preview web), il n'y a pas de bus Tauri.
  });
}

function storedQuickPrefs(): SharedQuickPrefs {
  const accent = localStorage.getItem(ACCENT_KEY);
  const reflection = localStorage.getItem(REFLECTION_KEY);
  return {
    accent: isAccent(accent) ? accent : DEFAULT_ACCENT,
    oled: localStorage.getItem(OLED_KEY) === "1",
    reflection: isReflection(reflection) ? reflection : DEFAULT_REFLECTION,
  };
}

interface UIPrefs {
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
  nav: NavStyle;
  setNav: (nav: NavStyle) => void;
  /** « Noir pur » (OLED) : orthogonal au thème clair/sombre, n'a d'effet que
   *  combiné à `.dark` (voir `.dark[data-oled]` dans globals.css). */
  oled: boolean;
  setOled: (oled: boolean) => void;
  /** Traitement du widget de progression du Planificateur. */
  pulse: PulseStyleId;
  setPulse: (pulse: PulseStyleId) => void;
  /** Présence animée affichée pendant la réflexion de la fenêtre rapide. */
  reflection: ReflectionStyleId;
  setReflection: (reflection: ReflectionStyleId) => void;
}

const UIPrefsContext = createContext<UIPrefs | null>(null);

function isAccent(value: string | null): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

function isPulse(value: string | null): value is PulseStyleId {
  return PULSE_STYLES.some((p) => p.id === value);
}

function isReflection(value: string | null): value is ReflectionStyleId {
  return REFLECTION_STYLES.some((style) => style.id === value);
}

/**
 * Préférences d'interface (frontend uniquement, localStorage) : couleur
 * d'accent et style de navigation. L'accent est appliqué en posant
 * `data-accent` sur <html> — toutes les surfaces utilisant `var(--brand)` se
 * re-teintent instantanément, y compris la fenêtre quick.
 */
export function UIPrefsProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [nav, setNavState] = useState<NavStyle>(DEFAULT_NAV);
  const [oled, setOledState] = useState(false);
  const [pulse, setPulseState] = useState<PulseStyleId>(DEFAULT_PULSE);
  const [reflection, setReflectionState] = useState<ReflectionStyleId>(DEFAULT_REFLECTION);

  // Lecture au montage (client uniquement — évite tout mismatch SSG).
  useEffect(() => {
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (isAccent(storedAccent)) setAccentState(storedAccent);
    const storedNav = localStorage.getItem(NAV_KEY);
    if (storedNav === "dock" || storedNav === "sidebar") setNavState(storedNav);
    setOledState(localStorage.getItem(OLED_KEY) === "1");
    const storedPulse = localStorage.getItem(PULSE_KEY);
    if (isPulse(storedPulse)) setPulseState(storedPulse);
    const storedReflection = localStorage.getItem(REFLECTION_KEY);
    if (isReflection(storedReflection)) setReflectionState(storedReflection);
  }, []);

  // Pont explicite entre la fenêtre principale et /quick. Au premier montage,
  // la capture demande son état actuel ; ensuite chaque changement utile est
  // publié immédiatement. Ainsi un accent choisi pendant que /quick est caché
  // reste le même à sa prochaine ouverture.
  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let stopRequest: (() => void) | undefined;
    let cancelled = false;
    const quickWindow = window.location.pathname.replace(/\/$/, "") === "/quick";

    const setup = async () => {
      stopSync = await listen<SharedQuickPrefs>(QUICK_PREFS_SYNC, ({ payload }) => {
        if (payload.accent && isAccent(payload.accent)) setAccentState(payload.accent);
        if (typeof payload.oled === "boolean") setOledState(payload.oled);
        if (payload.reflection && isReflection(payload.reflection)) setReflectionState(payload.reflection);
      });
      if (quickWindow) {
        await emit(QUICK_PREFS_REQUEST).catch(() => {});
      } else {
        stopRequest = await listen(QUICK_PREFS_REQUEST, () => {
          publishQuickPrefs(storedQuickPrefs());
        });
      }
      if (cancelled) {
        stopSync?.();
        stopRequest?.();
      }
    };
    void setup();
    return () => {
      cancelled = true;
      stopSync?.();
      stopRequest?.();
    };
  }, []);

  // La fenêtre quick est un second webview déjà monté quand la préférence est
  // modifiée depuis Réglages. `storage` suffit dans les navigateurs usuels ;
  // son signal entre webviews n’est toutefois pas garanti par toutes les
  // versions de WebView2. La relire au retour du focus garantit que le choix
  // est bien appliqué à la prochaine ouverture d’Alt+Q dans les deux cas.
  useEffect(() => {
    const readReflection = () => {
      const stored = localStorage.getItem(REFLECTION_KEY);
      setReflectionState(isReflection(stored) ? stored : DEFAULT_REFLECTION);
    };
    const syncFromAnotherWindow = (event: StorageEvent) => {
      if (event.key === REFLECTION_KEY) readReflection();
    };
    window.addEventListener("storage", syncFromAnotherWindow);
    window.addEventListener("focus", readReflection);
    document.addEventListener("visibilitychange", readReflection);
    return () => {
      window.removeEventListener("storage", syncFromAnotherWindow);
      window.removeEventListener("focus", readReflection);
      document.removeEventListener("visibilitychange", readReflection);
    };
  }, []);

  // Application de l'accent sur <html>.
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  // Application du Noir pur — n'a d'effet que combiné à `.dark` (voir
  // globals.css), donc rester actif sans risque même quand le thème résolu
  // est clair (l'attribut est simplement sans effet dans ce cas).
  useEffect(() => {
    document.documentElement.toggleAttribute("data-oled", oled);
  }, [oled]);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    localStorage.setItem(ACCENT_KEY, next);
    publishQuickPrefs({ accent: next });
  }, []);

  const setOled = useCallback((next: boolean) => {
    setOledState(next);
    localStorage.setItem(OLED_KEY, next ? "1" : "0");
    publishQuickPrefs({ oled: next });
  }, []);

  const setNav = useCallback((next: NavStyle) => {
    setNavState(next);
    localStorage.setItem(NAV_KEY, next);
  }, []);

  const setPulse = useCallback((next: PulseStyleId) => {
    setPulseState(next);
    localStorage.setItem(PULSE_KEY, next);
  }, []);

  const setReflection = useCallback((next: ReflectionStyleId) => {
    setReflectionState(next);
    localStorage.setItem(REFLECTION_KEY, next);
    publishQuickPrefs({ reflection: next });
  }, []);

  return (
    <UIPrefsContext.Provider
      value={{
        accent,
        setAccent,
        nav,
        setNav,
        oled,
        setOled,
        pulse,
        setPulse,
        reflection,
        setReflection,
      }}
    >
      {children}
    </UIPrefsContext.Provider>
  );
}

export function useUIPrefs(): UIPrefs {
  const ctx = useContext(UIPrefsContext);
  if (!ctx) throw new Error("useUIPrefs doit être utilisé sous UIPrefsProvider.");
  return ctx;
}
