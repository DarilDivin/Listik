"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { exitTween, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";

export type SectionTone = "default" | "today" | "danger";

interface SectionCardProps {
  title: string;
  count: number;
  tone?: SectionTone;
  delay?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Groupe temporel de tâches (En retard, Aujourd'hui…) : posé directement sur
 * la page, sans carte ni ombre — séparé du groupe précédent par une simple
 * ligne hairline. L'en-tête encode le moment par un point : rouge (retard),
 * accent (aujourd'hui), neutre (à venir).
 */
export function SectionCard({
  title,
  count,
  tone = "default",
  delay = 0,
  className,
  children,
}: SectionCardProps) {
  const dotClass =
    tone === "danger"
      ? "bg-destructive"
      : tone === "today"
        ? "bg-brand"
        : "bg-muted-foreground/35";

  const labelClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "today"
        ? "text-foreground"
        : "text-muted-foreground";

  return (
    <motion.section
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay } }}
      exit={{ opacity: 0, y: 6, transition: exitTween }}
      className={cn(
        "border-t border-border/60 pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 px-3 pb-2">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", dotClass)}
          style={
            tone === "today"
              ? { boxShadow: "0 0 0 4px var(--brand-soft)" }
              : undefined
          }
        />

        <span className={cn("text-[13px] font-semibold tracking-[-0.005em]", labelClass)}>
          {title}
        </span>

        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
          <AnimatedNumber value={count} />
        </span>
      </h3>

      <div>{children}</div>
    </motion.section>
  );
}
