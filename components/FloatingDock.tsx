"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  CalendarDays,
  Search,
  Settings,
  Sparkles,
  StickyNote,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Planificateur", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/settings", label: "Réglages", icon: Settings },
];

interface FloatingDockProps {
  onOpenSearch?: () => void;
}

/**
 * Dock flottant : pilule verticale sculptée, centrée à gauche. La pastille
 * active (lavis d'accent) GLISSE d'une icône à l'autre (layoutId) ; chaque
 * icône se soulève au survol et s'écrase légèrement au clic, façon Dock macOS.
 */
export function FloatingDock({ onOpenSearch }: FloatingDockProps) {
  const raw = usePathname() ?? "/";
  const pathname = raw.replace(/\/$/, "") || "/";

  return (
    <motion.nav
      initial={{ opacity: 0, x: -24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ ...spring.pop, delay: 0.05 }}
      className="card-floating fixed left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 p-2"
      aria-label="Navigation principale"
    >
      {onOpenSearch && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={onOpenSearch}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={spring.snappy}
                aria-label="Rechercher (Ctrl K)"
                className="grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:text-foreground"
              >
                <Search size={19} strokeWidth={2.1} />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Rechercher · Ctrl K
            </TooltipContent>
          </Tooltip>
          <span aria-hidden className="my-0.5 h-px w-6 bg-border" />
        </>
      )}

      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <motion.span
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={spring.snappy}
                className="relative"
              >
                {active && (
                  <motion.span
                    layoutId="dock-active"
                    aria-hidden
                    className="absolute inset-0 rounded-2xl bg-brand-soft"
                    transition={spring.snappy}
                  />
                )}
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative z-10 grid size-11 place-items-center rounded-2xl transition-colors",
                    active
                      ? "text-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={19} strokeWidth={2.1} />
                </Link>
              </motion.span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </motion.nav>
  );
}
