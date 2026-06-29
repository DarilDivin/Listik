"use client";

import { motion } from "motion/react";
import { Calendar } from "lucide-react";

interface TodoDateProps {
  /** Date « jour seul » au format YYYY-MM-DD. */
  date: string;
  dimmed?: boolean;
  /** Échéance dépassée → affichage en rouge. */
  overdue?: boolean;
}

/** Date planifiée d'une tâche, au format court (« 7 juin »). */
export function TodoDate({ date, dimmed = false, overdue = false }: TodoDateProps) {
  const label = new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  return (
    <motion.span
      className={`inline-flex items-center gap-1 text-xs ${
        overdue ? "text-destructive" : "text-muted-foreground"
      }`}
      animate={{ opacity: dimmed ? 0.6 : 1 }}
      transition={{ duration: 0.25 }}
    >
      <Calendar size={12} className="opacity-70" />
      {label}
    </motion.span>
  );
}
