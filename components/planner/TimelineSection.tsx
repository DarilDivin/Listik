"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Indigo signature (token brand), réservé au nœud « aujourd'hui ». */
const ACCENT = "var(--brand)";

export type SectionTone = "default" | "today" | "danger";

interface TimelineSectionProps {
  title: string;
  count: number;
  tone?: SectionTone;
  delay?: number;
  children: ReactNode;
}

/**
 * Section d'une journée sur l'épine timeline : un nœud (cercle) posé sur la
 * ligne verticale partagée par le parent, le libellé, puis les tâches.
 * Le nœud encode le moment : rouge (en retard), indigo plein (aujourd'hui),
 * cercle creux (à venir).
 */
export function TimelineSection({
  title,
  count,
  tone = "default",
  delay = 0,
  children,
}: TimelineSectionProps) {
  const labelColor =
    tone === "danger"
      ? "text-destructive"
      : tone === "today"
        ? "text-foreground"
        : "text-muted-foreground";

  const nodeClass =
    tone === "danger"
      ? "border-transparent bg-destructive"
      : tone === "today"
        ? "border-transparent"
        : "border-border bg-background";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
      className="relative pl-7"
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[2px] top-[3px] size-2.5 rounded-full border-2",
          nodeClass,
        )}
        style={
          tone === "today"
            ? {
                background: ACCENT,
                boxShadow:
                  "0 0 0 4px color-mix(in oklch, var(--brand) 20%, transparent)",
              }
            : undefined
        }
      />

      <h3
        className={cn(
          "flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em]",
          labelColor,
        )}
      >
        {title}
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">
          {count}
        </span>
      </h3>

      <div className="mt-2">{children}</div>
    </motion.section>
  );
}
