"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";

import { useUIPrefs } from "@/components/ui-prefs";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { exitTween, spring } from "@/lib/motion";

const OPTIONS = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

/**
 * Thème tri-état (Système / Clair / Sombre) + « Noir pur » (OLED), en deux
 * lignes de réglage.
 *
 * Noir pur est une préférence ORTHOGONALE au tri-état (voir `data-oled` dans
 * `ui-prefs.tsx`/`globals.css`), pas une 4e valeur du groupe : un bouton qui
 * ferait « setTheme("dark") + activer le flag » désynchroniserait la
 * sélection. Sa ligne n'existe que quand le thème RÉSOLU est sombre — en
 * clair, elle n'aurait aucun effet visible.
 */
export function ThemeSetting() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { oled, setOled } = useUIPrefs();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Avant hydratation : on suppose « système » (évite tout flash incohérent).
  const active = (mounted ? (theme ?? "system") : "system") as ThemeValue;
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      <SettingsRow label="Thème" description="Suit le système, ou reste clair ou sombre.">
        <Segmented options={OPTIONS} value={active} onChange={setTheme} aria-label="Thème" />
      </SettingsRow>
      <AnimatePresence initial={false}>
        {isDark && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { opacity: { duration: 0.18 }, default: spring.smooth } }}
            exit={{ height: 0, opacity: 0, transition: exitTween }}
            className="overflow-hidden"
          >
            <SettingsRow nested label="Noir pur" description="Un fond entièrement noir, pour les écrans OLED.">
              <Switch checked={oled} onCheckedChange={setOled} aria-label="Noir pur (OLED)" />
            </SettingsRow>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
