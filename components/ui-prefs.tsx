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

/** Les groupes du Planificateur (sections de la vue du jour, etc.). */
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

/**
 * Traitements du widget de progression du Planificateur. Quatre finis, un seul
 * endroit : la combinatoire est nulle (choix de l'utilisateur, 2026-10-20, de
 * les garder tous).
 */
export const PULSE_STYLES = [
  { id: "ring", label: "Anneau" },
  { id: "dial", label: "Cadran" },
  { id: "bar", label: "Barre" },
  { id: "countdown", label: "Compte" },
] as const;

export type PulseStyleId = (typeof PULSE_STYLES)[number]["id"];

const ACCENT_KEY = "listik.accent";
const NAV_KEY = "listik.nav";
const OLED_KEY = "listik.oled";
const PULSE_KEY = "listik.pulse";
const DEFAULT_ACCENT: AccentId = "teal";
const DEFAULT_NAV: NavStyle = "dock";
// L'anneau reste le défaut : il est la signature de la page et du dock, et
// changer ce qu'un utilisateur voit déjà n'est pas au programme d'un réglage
// qui sert justement à lui laisser le choix.
const DEFAULT_PULSE: PulseStyleId = "ring";

type SharedQuickPrefs = {
  accent?: AccentId;
  oled?: boolean;
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
  return {
    accent: isAccent(accent) ? accent : DEFAULT_ACCENT,
    oled: localStorage.getItem(OLED_KEY) === "1",
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
}

const UIPrefsContext = createContext<UIPrefs | null>(null);

function isAccent(value: string | null): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

function isPulse(value: string | null): value is PulseStyleId {
  return PULSE_STYLES.some((p) => p.id === value);
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

  // Lecture au montage (client uniquement — évite tout mismatch SSG).
  useEffect(() => {
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (isAccent(storedAccent)) setAccentState(storedAccent);
    const storedNav = localStorage.getItem(NAV_KEY);
    if (storedNav === "dock" || storedNav === "sidebar") setNavState(storedNav);
    setOledState(localStorage.getItem(OLED_KEY) === "1");
    const storedPulse = localStorage.getItem(PULSE_KEY);
    if (isPulse(storedPulse)) setPulseState(storedPulse);
  }, []);

  // Pont explicite entre la fenêtre principale et /quick (et le panneau du
  // tray, /tray, lui aussi monté caché pour toute la session). Au premier
  // montage, la fenêtre secondaire demande son état actuel ; ensuite chaque
  // changement utile est publié immédiatement. Ainsi un accent choisi pendant
  // qu'elle est cachée reste le même à sa prochaine ouverture.
  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let stopRequest: (() => void) | undefined;
    let cancelled = false;
    const path = window.location.pathname.replace(/\/$/, "");
    const secondaryWindow = path === "/quick" || path === "/tray";

    const setup = async () => {
      stopSync = await listen<SharedQuickPrefs>(QUICK_PREFS_SYNC, ({ payload }) => {
        if (payload.accent && isAccent(payload.accent)) setAccentState(payload.accent);
        if (typeof payload.oled === "boolean") setOledState(payload.oled);
      });
      if (secondaryWindow) {
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
