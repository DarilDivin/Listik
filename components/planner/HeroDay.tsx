"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { spring } from "@/lib/motion";

interface HeroDayProps {
  date: Date;
  done: number;
  total: number;
}

/**
 * En-tête du Planificateur : posé directement sur la page (aucune carte, aucune
 * ombre) — la date à gauche, le widget de progression à droite, séparés du
 * reste par une simple ligne hairline. Boucler la journée déclenche une lueur
 * d'accent + petit pop de l'anneau.
 */
export function HeroDay({ date, done, total }: HeroDayProps) {
  const weekday = date.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayMonth = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const year = date.getFullYear();

  const remaining = total - done;
  const complete = total > 0 && remaining === 0;
  const caption =
    total === 0
      ? "rien de prévu aujourd'hui"
      : complete
        ? "journée bouclée, bravo"
        : `${remaining} tâche${remaining > 1 ? "s" : ""} à faire`;

  // Joue la lueur uniquement à la *transition* vers 100 % (pas au montage).
  const [celebrate, setCelebrate] = useState(false);
  const wasComplete = useRef(complete);
  useEffect(() => {
    if (complete && !wasComplete.current) {
      setCelebrate(true);
      const id = setTimeout(() => setCelebrate(false), 1300);
      wasComplete.current = complete;
      return () => clearTimeout(id);
    }
    wasComplete.current = complete;
  }, [complete]);

  return (
    <div className="flex items-end justify-between gap-6 border-b border-border/60 pb-6 max-sm:flex-col max-sm:items-start max-sm:gap-5">
      {/* Date */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="min-w-0 flex-1"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
          {weekday}
        </p>
        <h1 className="mt-2 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.025em] text-foreground">
          {dayMonth}
          <span className="ml-2 font-medium text-muted-foreground/50">
            {year}
          </span>
        </h1>
        <div className="mt-2.5 h-5 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={spring.smooth}
              className="text-sm text-muted-foreground"
            >
              {caption}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Widget progression — anneau fin en satellite du chiffre, pas l'inverse. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.05 }}
        className="relative flex shrink-0 items-center gap-3"
      >
        {celebrate && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-4 rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--brand) 30%, transparent), transparent 70%)",
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 0.7, 0], scale: [0.7, 1.08, 1.18] }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
          />
        )}

        <motion.div
          animate={celebrate ? { scale: [1, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <ProgressRing progress={total > 0 ? done / total : 0} size={40} strokeWidth={3} />
        </motion.div>

        <div className="flex flex-col gap-0.5 pr-1">
          <span className="flex items-baseline gap-1 font-mono tabular-nums">
            <AnimatedNumber
              value={done}
              className="text-2xl font-semibold text-foreground"
            />
            <span className="text-sm text-muted-foreground/60">/ {total}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            aujourd&apos;hui
          </span>
        </div>
      </motion.div>
    </div>
  );
}
