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
 *
 * Débranché (Phase O) : les 5 styles autres que « list » ne sont plus
 * sélectionnables depuis l'interface (voir `SECTION_STYLES_LOCKED`
 * ci-dessous, seule table réellement consultée par le rendu). Conservé tel
 * quel — candidat explicite à une vraie refonte en Phase S.
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
const OLED_KEY = "listik.oled";
const DEFAULT_ACCENT: AccentId = "teal";
const DEFAULT_NAV: NavStyle = "dock";

interface UIPrefs {
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
  nav: NavStyle;
  setNav: (nav: NavStyle) => void;
  /** « Noir pur » (OLED) : orthogonal au thème clair/sombre, n'a d'effet que
   *  combiné à `.dark` (voir `.dark[data-oled]` dans globals.css). */
  oled: boolean;
  setOled: (oled: boolean) => void;
}

const UIPrefsContext = createContext<UIPrefs | null>(null);

function isAccent(value: string | null): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
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

  // Lecture au montage (client uniquement — évite tout mismatch SSG).
  useEffect(() => {
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (isAccent(storedAccent)) setAccentState(storedAccent);
    const storedNav = localStorage.getItem(NAV_KEY);
    if (storedNav === "dock" || storedNav === "sidebar") setNavState(storedNav);
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

  return (
    <UIPrefsContext.Provider value={{ accent, setAccent, nav, setNav, oled, setOled }}>
      {children}
    </UIPrefsContext.Provider>
  );
}

export function useUIPrefs(): UIPrefs {
  const ctx = useContext(UIPrefsContext);
  if (!ctx) throw new Error("useUIPrefs doit être utilisé sous UIPrefsProvider.");
  return ctx;
}
