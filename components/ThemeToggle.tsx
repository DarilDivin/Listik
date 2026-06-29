"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type ThemePref = "system" | "light" | "dark";

const ORDER: ThemePref[] = ["system", "light", "dark"];
const META: Record<ThemePref, { Icon: typeof Sun; label: string }> = {
  system: { Icon: Monitor, label: "Système" },
  light: { Icon: Sun, label: "Clair" },
  dark: { Icon: Moon, label: "Sombre" },
};

/**
 * Bascule rapide du thème : cycle Système → Clair → Sombre. « Système » suit
 * l'OS. L'icône reflète la préférence et se substitue avec un petit fondu fluide.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full border-none bg-transparent text-muted-foreground opacity-50 shadow-none blur-sm focus:outline-none focus:ring-0"
      >
        <span className="h-4 w-4" />
      </Button>
    );
  }

  const current = (theme as ThemePref) ?? "system";
  const { Icon, label } = META[current];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      title={`Thème : ${label}`}
      className="relative h-8 w-8 overflow-hidden rounded-full border-none bg-transparent text-muted-foreground shadow-none hover:bg-accent/50 hover:text-foreground focus:outline-none focus:ring-0"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={current}
          initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.45 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Icon className="h-[1.1rem] w-[1.1rem]" />
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">Basculer le thème ({label})</span>
    </Button>
  );
}
