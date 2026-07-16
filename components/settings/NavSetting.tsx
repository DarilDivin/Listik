"use client";

import { motion } from "motion/react";
import { Dock, PanelLeft } from "lucide-react";
import { useUIPrefs, type NavStyle } from "@/components/ui-prefs";
import { cn } from "@/lib/utils";

const OPTIONS: { value: NavStyle; label: string; Icon: typeof Dock }[] = [
  { value: "dock", label: "Dock flottant", Icon: Dock },
  { value: "sidebar", label: "Barre latérale", Icon: PanelLeft },
];

/**
 * Choix du style de navigation (même pattern que ThemeSetting) : la pastille
 * active glisse entre les deux options. Appliqué immédiatement via UIPrefs.
 */
export function NavSetting() {
  const { nav, setNav } = useUIPrefs();

  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1">
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = nav === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setNav(value)}
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
                layoutId="nav-setting-thumb"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-card/90 ring-1 ring-foreground/10"
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
