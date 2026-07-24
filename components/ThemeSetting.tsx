"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useUIPrefs } from "@/components/ui-prefs";
import { Switch } from "@/components/ui/switch";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";

const OPTIONS = [
  { value: "system", label: "Système", Icon: Monitor },
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];
const VALUES: readonly ThemeValue[] = OPTIONS.map((o) => o.value);

/**
 * Sélecteur de thème tri-état (Système / Clair / Sombre) + interrupteur
 * « Noir pur » (OLED, phase N). « Système » suit l'OS. Composant réutilisable
 * — destiné aussi à la future page Paramètres.
 *
 * La pastille active glisse façon iOS 26 : matière « liquid glass » (translucide
 * + reflet spéculaire) et ressort fluide « gel ». (Réduit si reduced-motion.)
 *
 * Noir pur est une préférence ORTHOGONALE au tri-état (voir `data-oled` dans
 * `ui-prefs.tsx`/`globals.css`), pas une 4e valeur du groupe : un bouton du
 * groupe qui ferait « setTheme("dark") + activer le flag » désynchroniserait
 * la sélection (le bouton « Sombre » paraîtrait inactif alors que Noir pur
 * est en réalité une variante de sombre). Interrupteur séparé, visible et actif
 * uniquement quand le thème RÉSOLU est sombre — inactif ou masqué en clair,
 * où « Noir pur » n'aurait aucun effet visible.
 */
export function ThemeSetting() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { oled, setOled } = useUIPrefs();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Avant hydratation : on suppose « système » (évite tout flash incohérent).
  const active = (mounted ? (theme ?? "system") : "system") as ThemeValue;
  const isDark = mounted && resolvedTheme === "dark";
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, active, setTheme);

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Thème"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1 backdrop-blur-md"
      >
        {OPTIONS.map(({ value, label, Icon }, i) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              {...getItemProps(value, i)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-colors duration-200",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/80",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="theme-glass"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-xl bg-card/80 backdrop-blur-md ring-1 ring-foreground/10"
                  style={{
                    boxShadow:
                      "inset 0 1px 0 0 color-mix(in oklch, white 22%, transparent), 0 1px 3px 0 rgb(0 0 0 / 0.10)",
                  }}
                  transition={{ type: "spring", bounce: 0.28, duration: 0.55 }}
                />
              )}
              <Icon size={15} className="relative" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {isDark && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2.5">
              <span className="text-[13px] font-medium text-foreground">Noir pur</span>
              <Switch checked={oled} onCheckedChange={setOled} aria-label="Noir pur (OLED)" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
