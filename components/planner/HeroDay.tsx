"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DayPulse } from "@/components/planner/DayPulse";
import { spring } from "@/lib/motion";
import { useDayProgress, useDayRemainder } from "@/lib/day-progress";

interface HeroDayProps {
  date: Date;
  done: number;
  total: number;
  /** Tâches en retard, TOUTES listes confondues (voir la page). */
  overdue: number;
}

/**
 * En-tête du Planificateur : posé directement sur la page (aucune carte, aucune
 * ombre) — la date à gauche, le widget de progression à droite, séparés du
 * reste par une simple ligne hairline. Boucler la journée déclenche une lueur
 * d'accent + petit pop de l'anneau.
 */
export function HeroDay({ date, done, total, overdue }: HeroDayProps) {
  const weekday = date.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayMonth = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const year = date.getFullYear();

  // Part de la journée écoulée : le repère de l'anneau. Ce que l'horloge du
  // système ne dit pas — non pas « quelle heure il est », mais « où j'en suis
  // par rapport au temps qu'il me reste ».
  const dayProgress = useDayProgress();

  const dayLeft = useDayRemainder();

  const remaining = total - done;
  const complete = total > 0 && remaining === 0;

  /**
   * La légende ne répète JAMAIS le pouls : celui-ci compte les tâches, elle
   * est le sous-titre du JOUR. Elle affiche le premier de ces faits :
   *
   *   1. une journée vide ;
   *   2. la célébration, qu'on ne sacrifie pas à l'économie de mots ;
   *   3. le temps qui reste — un absolu, là où le pouls donne un rapport
   *      (« au rythme du jour ») ;
   *   4. le retard, en dernier recours.
   *
   * Le retard passe DERRIÈRE le temps qui reste, par choix : ouvrir sa
   * journée sur une dette est un ton, et ce n'est pas celui de l'app.
   *
   * Conséquence à connaître, ce n'est pas un oubli : le rang 3 répond dès
   * qu'on est entre 7 h et 23 h, donc le rang 4 ne s'affiche en pratique
   * qu'en dehors de ces heures. Le retard vit dans sa section, pas dans le
   * bandeau — c'est exactement ce que cet ordre décide.
   */
  const caption = (() => {
    if (total === 0) return "rien de prévu aujourd'hui";
    if (complete) return "journée bouclée, bravo";
    if (dayLeft?.kind === "left") {
      return dayLeft.minutes < 60
        ? "il reste moins d'une heure"
        : `il reste ${Math.round(dayLeft.minutes / 60)} h de journée`;
    }
    if (overdue > 0) return `${overdue} tâche${overdue > 1 ? "s" : ""} en retard`;
    if (dayLeft?.kind === "before") return "la journée commence";
    if (dayLeft?.kind === "after") return "la journée est finie";
    return "";
  })();

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

      {/* Le pouls du jour — quatre traitements au choix (Réglages →
          Personnalisation) ; la célébration, elle, les enveloppe tous. */}
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
          <DayPulse done={done} total={total} dayProgress={dayProgress} />
        </motion.div>
      </motion.div>
    </div>
  );
}
