"use client";

import { motion } from "motion/react";
import { Dock, PanelLeft } from "lucide-react";
import { useUIPrefs, type NavStyle } from "@/components/ui-prefs";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";

const OPTIONS: { value: NavStyle; label: string; Icon: typeof Dock }[] = [
  { value: "dock", label: "Dock flottant", Icon: Dock },
  { value: "sidebar", label: "Barre latérale", Icon: PanelLeft },
];
const VALUES: readonly NavStyle[] = OPTIONS.map((o) => o.value);

/**
 * Choix du style de navigation en grandes tuiles, pour l'accueil : la pastille
 * active glisse entre les deux options, à plat. Appliqué immédiatement via
 * UIPrefs. Les Réglages en font une ligne avec `Segmented`.
 */
export function NavSetting() {
  const { nav, setNav } = useUIPrefs();
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, nav, setNav);

  return (
    <div
      role="radiogroup"
      aria-label="Navigation"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1"
    >
      {OPTIONS.map(({ value, label, Icon }, i) => {
        const isActive = nav === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setNav(value)}
            {...getItemProps(value, i)}
            className={cn(
              "relative isolate flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-colors duration-200",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="nav-setting-thumb"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.04] dark:bg-accent dark:ring-white/[0.07]"
                transition={spring.snappy}
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
