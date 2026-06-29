"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "Système", Icon: Monitor },
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
] as const;

/**
 * Sélecteur de thème tri-état (Système / Clair / Sombre). « Système » suit l'OS.
 * Composant réutilisable — destiné aussi à la future page Paramètres.
 *
 * La pastille active glisse façon iOS 26 : matière « liquid glass » (translucide
 * + reflet spéculaire) et ressort fluide « gel ». (Réduit si reduced-motion.)
 */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Avant hydratation : on suppose « système » (évite tout flash incohérent).
  const active = mounted ? (theme ?? "system") : "system";

  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1 backdrop-blur-md">
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={isActive}
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
  );
}
