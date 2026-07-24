"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
 */
export const SECTION_STYLE_OPTIONS: Record<SectionKey, SectionStyleId[]> = {
  overdue: ["list", "horizon", "loupe", "portal"],
  today: ["list", "horizon", "loupe", "portal"],
  evening: ["list", "horizon", "loupe", "portal"],
  tomorrow: ["list", "horizon", "loupe", "portal"],
  upcoming: ["list", "horizon", "zoom", "loupe", "portal"],
  inbox: ["list", "horizon", "loupe", "portal"],
  anytime: ["list", "horizon", "loupe", "portal"],
  someday: ["list", "horizon", "loupe", "portal"],
  completed: ["list", "horizon", "strata", "loupe", "portal"],
};

const DEFAULT_SECTION_STYLES: Record<SectionKey, SectionStyleId> = {
  overdue: "list",
  today: "list",
  evening: "list",
  tomorrow: "list",
  upcoming: "list",
  inbox: "list",
  anytime: "list",
  someday: "list",
  completed: "list",
};

const ACCENT_KEY = "listik.accent";
const NAV_KEY = "listik.nav";
const SECTION_STYLES_KEY = "listik.sectionStyles";
const OLED_KEY = "listik.oled";
const DEFAULT_ACCENT: AccentId = "teal";
const DEFAULT_NAV: NavStyle = "dock";

interface UIPrefs {
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
  nav: NavStyle;
  setNav: (nav: NavStyle) => void;
  sectionStyles: Record<SectionKey, SectionStyleId>;
  setSectionStyle: (section: SectionKey, style: SectionStyleId) => void;
  /** « Noir pur » (OLED) : orthogonal au thème clair/sombre, n'a d'effet que
   *  combiné à `.dark` (voir `.dark[data-oled]` dans globals.css). */
  oled: boolean;
  setOled: (oled: boolean) => void;
}

const UIPrefsContext = createContext<UIPrefs | null>(null);

function isAccent(value: string | null): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

function isSectionStyleId(value: unknown): value is SectionStyleId {
  return SECTION_STYLES.some((s) => s.id === value);
}

/** Valide et complète un objet stocké (versions futures pourraient ajouter des clés). */
function parseSectionStyles(raw: string | null): Record<SectionKey, SectionStyleId> {
  if (!raw) return DEFAULT_SECTION_STYLES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<SectionKey, unknown>>;
    const result = { ...DEFAULT_SECTION_STYLES };
    (Object.keys(DEFAULT_SECTION_STYLES) as SectionKey[]).forEach((key) => {
      const value = parsed[key];
      if (isSectionStyleId(value) && SECTION_STYLE_OPTIONS[key].includes(value)) {
        result[key] = value;
      }
    });
    return result;
  } catch {
    return DEFAULT_SECTION_STYLES;
  }
}

/**
 * Préférences d'interface (frontend uniquement, localStorage) : couleur
 * d'accent, style de navigation, et style d'affichage de chaque section du
 * planner. L'accent est appliqué en posant `data-accent` sur <html> — toutes
 * les surfaces utilisant `var(--brand)` se re-teintent instantanément, y
 * compris la fenêtre quick.
 */
export function UIPrefsProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [nav, setNavState] = useState<NavStyle>(DEFAULT_NAV);
  const [sectionStyles, setSectionStyles] =
    useState<Record<SectionKey, SectionStyleId>>(DEFAULT_SECTION_STYLES);
  const [oled, setOledState] = useState(false);

  // Lecture au montage (client uniquement — évite tout mismatch SSG).
  useEffect(() => {
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (isAccent(storedAccent)) setAccentState(storedAccent);
    const storedNav = localStorage.getItem(NAV_KEY);
    if (storedNav === "dock" || storedNav === "sidebar") setNavState(storedNav);
    setSectionStyles(parseSectionStyles(localStorage.getItem(SECTION_STYLES_KEY)));
    setOledState(localStorage.getItem(OLED_KEY) === "1");
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
  }, []);

  const setOled = useCallback((next: boolean) => {
    setOledState(next);
    localStorage.setItem(OLED_KEY, next ? "1" : "0");
  }, []);

  const setNav = useCallback((next: NavStyle) => {
    setNavState(next);
    localStorage.setItem(NAV_KEY, next);
  }, []);

  const setSectionStyle = useCallback((section: SectionKey, style: SectionStyleId) => {
    setSectionStyles((prev) => {
      const next = { ...prev, [section]: style };
      localStorage.setItem(SECTION_STYLES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <UIPrefsContext.Provider
      value={{ accent, setAccent, nav, setNav, sectionStyles, setSectionStyle, oled, setOled }}
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
