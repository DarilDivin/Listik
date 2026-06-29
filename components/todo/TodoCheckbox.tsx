"use client";

import { motion } from "motion/react";
import type { Priority } from "@/features/todos/types";
import { priorityRingColor } from "@/features/todos/priority";

interface TodoCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  priority?: Priority;
}

/**
 * Case à cocher ronde dont l'anneau reflète la priorité (discret). En cochant,
 * la coche se *trace* et la case fait un petit rebond — un micro-moment de
 * satisfaction. (Réduit automatiquement si `prefers-reduced-motion`.)
 */
export function TodoCheckbox({ checked, onToggle, priority = "normal" }: TodoCheckboxProps) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={checked ? "Marquer comme à faire" : "Marquer comme terminé"}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      animate={{
        backgroundColor: checked ? "var(--color-primary)" : "rgba(0,0,0,0)",
        borderColor: checked ? "var(--color-primary)" : priorityRingColor(priority),
        scale: checked ? [1, 1.09, 1] : 1,
      }}
      transition={{
        backgroundColor: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
        borderColor: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
        scale: { duration: 0.32, ease: [0.16, 1, 0.3, 1], times: [0, 0.4, 1] },
      }}
      className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 text-primary-foreground"
    >
      <motion.svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        className="text-primary-foreground"
      >
        <motion.path
          d="M4 12.5 9 17.5 20 6"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{
            pathLength: {
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
              delay: checked ? 0.06 : 0,
            },
            opacity: { duration: 0.12 },
          }}
        />
      </motion.svg>
    </motion.button>
  );
}
