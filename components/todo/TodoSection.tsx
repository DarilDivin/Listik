"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface TodoSectionProps {
  title: string;
  count: number;
  delay?: number;
  tone?: "default" | "danger";
  children: ReactNode;
}

/** Section de tâches : libellé discret en majuscules + liste. */
export function TodoSection({
  title,
  count,
  delay = 0,
  tone = "default",
  children,
}: TodoSectionProps) {
  const labelColor =
    tone === "danger" ? "text-destructive/80" : "text-muted-foreground/70";
  const countColor =
    tone === "danger" ? "text-destructive/55" : "text-muted-foreground/45";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
      className="space-y-2"
    >
      <h3
        className={`flex items-center gap-2 px-3 text-xs font-medium uppercase tracking-[0.08em] ${labelColor}`}
      >
        {title}
        <span className={`tabular-nums ${countColor}`}>{count}</span>
      </h3>
      {children}
    </motion.section>
  );
}
