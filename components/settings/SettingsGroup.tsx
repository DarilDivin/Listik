"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
  /** Position dans la liste, pour une entrée échelonnée (stagger). */
  index?: number;
}

/**
 * Groupe de réglages posé directement sur la page (pas de carte ni d'ombre) :
 * en-tête discret + lignes séparées par des hairlines. Entrée en ressort,
 * échelonnée par `index`.
 */
export function SettingsGroup({ title, children, index = 0 }: SettingsGroupProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.smooth, delay: index * 0.05 }}
    >
      {title && (
        <h2 className="mb-2 px-1 text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {title}
        </h2>
      )}
      <div className="divide-y divide-border/60">{children}</div>
    </motion.section>
  );
}
