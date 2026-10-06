"use client";

import { useUIPrefs, type NavStyle } from "@/components/ui-prefs";
import { Segmented } from "@/components/ui/segmented";

const OPTIONS: { value: NavStyle; label: string }[] = [
  { value: "dock", label: "Dock flottant" },
  { value: "sidebar", label: "Barre latérale" },
];

/**
 * Choix du style de navigation, appliqué immédiatement via UIPrefs. Le même
 * segment compact dans les Réglages et à l'accueil.
 */
export function NavSetting() {
  const { nav, setNav } = useUIPrefs();
  return <Segmented options={OPTIONS} value={nav} onChange={setNav} aria-label="Navigation" />;
}
