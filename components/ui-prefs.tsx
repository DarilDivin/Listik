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

/**
 * Les accents : six encres (blocs `[data-accent]` dans globals.css, où sont
 * aussi leurs règles). L'encre neutre d'abord, puis les couleurs dans l'ordre
 * du cercle chromatique : la rangée de pastilles se lit comme un dégradé.
 */
export const ACCENTS = [
  { id: "encre", label: "Encre" },
  { id: "petrole", label: "Pétrole" },
  { id: "bleu", label: "Bleu" },
  { id: "violette", label: "Violette" },
  { id: "framboise", label: "Framboise" },
  { id: "ambre", label: "Ambre" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

/**
 * Les accents d'avant (oct. 2026), encore enregistrés chez ceux qui en
 * avaient choisi un : chacun retrouve l'encre la plus proche plutôt que de
 * retomber en silence sur le défaut. Le corail n'a plus d'équivalent — trop
 * proche du rouge « en retard » —, la framboise est sa voisine.
 */
const ANCIENS_ACCENTS: Record<string, AccentId> = {
  teal: "petrole",
  indigo: "bleu",
  violet: "violette",
  rose: "framboise",
  coral: "framboise",
  amber: "ambre",
};
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
const DEFAULT_ACCENT: AccentId = "petrole";
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
  return {
    accent: lireAccent(localStorage.getItem(ACCENT_KEY)) ?? DEFAULT_ACCENT,
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

function isAccent(value: string | null | undefined): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

/** L'accent enregistré, traduit s'il date d'avant les encres. */
function lireAccent(value: string | null | undefined): AccentId | null {
  if (isAccent(value)) return value;
  return (value && ANCIENS_ACCENTS[value]) || null;
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
    const rawAccent = localStorage.getItem(ACCENT_KEY);
    const storedAccent = lireAccent(rawAccent);
    if (storedAccent) {
      setAccentState(storedAccent);
      // Un ancien nom est réécrit une fois pour toutes.
      if (storedAccent !== rawAccent) localStorage.setItem(ACCENT_KEY, storedAccent);
    }
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
        const accent = lireAccent(payload.accent);
        if (accent) setAccentState(accent);
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
