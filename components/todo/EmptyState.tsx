"use client";

import { motion } from "motion/react";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

/** Message centré affiché quand une liste de tâches est vide. */
export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-center py-12 text-muted-foreground"
    >
      <p className="text-lg">{title}</p>
      {subtitle && <p className="text-sm">{subtitle}</p>}
    </motion.div>
  );
}
