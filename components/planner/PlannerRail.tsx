"use client";

import { motion } from "motion/react";
import {
  Archive,
  BookCheck,
  CalendarDays,
  Inbox,
  Layers,
  Star,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { pressable, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PLANNER_VIEWS, type PlannerView } from "@/features/todos/grouping";

/** Icône par vue. `filled` : l'icône se remplit à l'état actif (façon Things). */
const VIEW_ICON: Record<PlannerView, { icon: LucideIcon; filled?: boolean }> = {
  inbox: { icon: Inbox },
  today: { icon: Star, filled: true },
  upcoming: { icon: CalendarDays },
  anytime: { icon: Layers },
  someday: { icon: Archive },
  journal: { icon: BookCheck },
};

interface PlannerRailProps {
  value: PlannerView;
  onChange: (view: PlannerView) => void;
  counts: Record<PlannerView, number>;
}

/**
 * Navigation GTD du Planificateur (Boîte de réception, Aujourd'hui, À venir,
 * Quand je peux, Un jour, Journal) — les repères d'un habitué de Things.
 *
 * Vit DANS la page Planificateur, pas dans le shell : il fonctionne ainsi à
 * l'identique que l'utilisateur ait choisi le dock flottant ou la sidebar, et
 * la navigation d'app (4 sections) reste stable.
 *
 * Posé à plat sur le canvas, séparé par une simple hairline — aucune carte.
 * L'état actif est une pastille `--brand-soft` partagée en `layoutId` qui
 * glisse d'un item à l'autre, comme le dock et la sidebar.
 */
export function PlannerRail({ value, onChange, counts }: PlannerRailProps) {
  return (
    <nav
      aria-label="Vues du planificateur"
      className="flex h-full w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 px-3 py-6 max-md:w-14"
    >
      {PLANNER_VIEWS.map((view, i) => {
        const { icon: Icon, filled } = VIEW_ICON[view.id];
        const active = value === view.id;
        // Le Journal grossit indéfiniment : son compteur serait du bruit.
        const count = view.id === "journal" ? 0 : counts[view.id];

        return (
          <motion.button
            key={view.id}
            type="button"
            onClick={() => onChange(view.id)}
            aria-current={active ? "page" : undefined}
            title={view.label}
            initial={{ opacity: 0, x: -6 }}
            animate={{
              opacity: 1,
              x: 0,
              transition: { ...spring.smooth, delay: i * 0.04 },
            }}
            {...pressable}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors max-md:justify-center max-md:px-0",
              active
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId="rail-active"
                transition={spring.snappy}
                className="absolute inset-0 rounded-xl bg-brand-soft"
              />
            )}

            <Icon
              size={16}
              className="relative z-10 shrink-0"
              fill={active && filled ? "currentColor" : "none"}
            />
            <span className="relative z-10 flex-1 truncate font-medium max-md:hidden">
              {view.label}
            </span>
            {count > 0 && (
              <span
                className={cn(
                  "relative z-10 font-mono text-[11px] tabular-nums max-md:hidden",
                  active ? "text-brand/70" : "text-muted-foreground/50",
                )}
              >
                <AnimatedNumber value={count} />
              </span>
            )}
          </motion.button>
        );
      })}
    </nav>
  );
}
