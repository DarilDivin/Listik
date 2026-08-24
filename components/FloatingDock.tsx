"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_NAV, isNavActive } from "@/components/app-nav";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface FloatingDockProps {
  onOpenSearch?: () => void;
  /**
   * Aimanté au pied du rail (mode dock, page avec contenu latéral) : la pilule
   * quitte son ancrage flottant centré-gauche et se pose en rangée horizontale.
   * Les `layoutId` partagés (`app-dock`, `dock-item-*`, `dock-active`) font
   * glisser la pilule et chaque icône d'un état à l'autre.
   */
  docked?: boolean;
}

/**
 * Dock flottant : pilule verticale sculptée, centrée à gauche. La pastille
 * active (lavis d'accent) GLISSE d'une icône à l'autre (layoutId) ; chaque
 * icône se soulève au survol et s'écrase légèrement au clic, façon Dock macOS.
 * En variante `docked`, la même pilule vient s'aimanter au pied du rail.
 */
export function FloatingDock({ onOpenSearch, docked = false }: FloatingDockProps) {
  const pathname = usePathname() ?? "/";
  const tooltipSide = docked ? "top" : "right";
  const itemSize = docked ? "size-9 rounded-xl" : "size-11 rounded-2xl";
  const iconSize = docked ? 17 : 19;

  return (
    <motion.nav
      layoutId="app-dock"
      transition={spring.smooth}
      initial={docked ? false : { opacity: 0, scale: 0.9 }}
      animate={docked ? undefined : { opacity: 1, scale: 1 }}
      className={cn(
        "card-floating z-30 flex items-center gap-1 p-2",
        docked
          ? "flex-row p-1.5 max-md:flex-col"
          : "fixed left-4 top-1/2 -translate-y-1/2 flex-col",
      )}
      aria-label="Navigation principale"
    >
      {onOpenSearch && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                layoutId="dock-item-search"
                type="button"
                onClick={onOpenSearch}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={spring.snappy}
                aria-label="Rechercher (Ctrl K)"
                className={cn(
                  "grid place-items-center text-muted-foreground transition-colors hover:text-foreground",
                  itemSize,
                )}
              >
                <Search size={iconSize} strokeWidth={2.1} />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} sideOffset={10}>
              Rechercher · Ctrl K
            </TooltipContent>
          </Tooltip>
          <span
            aria-hidden
            className={cn(
              "bg-border",
              docked
                ? "mx-0.5 h-6 w-px max-md:mx-0 max-md:my-0.5 max-md:h-px max-md:w-6"
                : "my-0.5 h-px w-6",
            )}
          />
        </>
      )}

      {APP_NAV.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <motion.span
                layoutId={`dock-item-${href}`}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={spring.snappy}
                className="relative"
              >
                {active && (
                  <motion.span
                    layoutId="dock-active"
                    aria-hidden
                    className={cn(
                      "absolute inset-0 bg-brand-soft",
                      docked ? "rounded-xl" : "rounded-2xl",
                    )}
                    transition={spring.snappy}
                  />
                )}
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative z-10 grid place-items-center transition-colors",
                    itemSize,
                    active
                      ? "text-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={iconSize} strokeWidth={2.1} />
                </Link>
              </motion.span>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} sideOffset={10}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </motion.nav>
  );
}
