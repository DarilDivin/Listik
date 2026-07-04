"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Indigo signature (token brand), réservé à la progression du jour. */
const ACCENT = "var(--brand)";
/** Décélération « Apple » (easeOutExpo-ish). */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface PlannerHeaderProps {
  date: Date;
  done: number;
  total: number;
}

/**
 * En-tête éditorial : jour de la semaine en capitales, date en serif, et un
 * indicateur discret du jour. Boucler la journée déclenche un moment feutré :
 * la jauge s'illumine et une lueur indigo s'épanouit doucement (sans gadget).
 */
export function PlannerHeader({ date, done, total }: PlannerHeaderProps) {
  const weekday = date.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayMonth = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const year = date.getFullYear();

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = total - done;
  const complete = total > 0 && remaining === 0;
  const caption =
    total === 0
      ? "rien de prévu"
      : complete
        ? "journée bouclée"
        : `${remaining} à faire`;

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
    <header className="flex items-end justify-between gap-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {weekday}
        </p>
        <h1 className="mt-2 text-5xl font-semibold leading-none tracking-[-0.022em] text-foreground">
          {dayMonth} <span className="text-muted-foreground/45">{year}</span>
        </h1>
      </div>

      <div className="relative flex shrink-0 flex-col items-end pb-1">
        {celebrate && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-8 rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--brand) 30%, transparent), transparent 70%)",
            }}
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{ opacity: [0, 0.65, 0], scale: [0.65, 1.1, 1.2] }}
            transition={{ duration: 1.3, ease: EASE_OUT }}
          />
        )}

        <p className="relative font-mono text-sm tabular-nums text-muted-foreground/70">
          {total > 0 ? (
            <>
              <span className="text-foreground">{done}</span>
              <span className="mx-px text-muted-foreground/40">/</span>
              {total}
            </>
          ) : (
            "—"
          )}
        </p>

        <div className="relative mt-0.5 h-4 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
              className="text-xs text-muted-foreground/70"
            >
              {caption}
            </motion.p>
          </AnimatePresence>
        </div>

        {total > 0 && (
          <div className="relative mt-2 h-1 w-24 overflow-hidden rounded-full bg-border/60">
            <motion.div
              className="h-full rounded-full"
              style={{ background: ACCENT }}
              initial={false}
              animate={{
                width: `${pct}%`,
                boxShadow: complete
                  ? "0 0 7px 0 color-mix(in oklch, var(--brand) 55%, transparent)"
                  : "0 0 0 0 transparent",
              }}
              transition={{
                width: { type: "spring", stiffness: 170, damping: 26 },
                boxShadow: { duration: 0.6, ease: EASE_OUT },
              }}
            />
          </div>
        )}
      </div>
    </header>
  );
}
