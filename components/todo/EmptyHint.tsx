"use client";

import type { ReactNode, Ref } from "react";
import { motion } from "motion/react";
import { exitTween, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface EmptyHintProps {
  /** Une ou deux phrases : ce qui viendra ici, jamais « X vide ». */
  children: ReactNode;
  /**
   * La liste s'est vidée parce que tout est fait. Seul ce cas porte une coche
   * (et l'accent) : « rien n'a commencé » n'est pas une réussite.
   */
  done?: boolean;
  /** Action qui fait la chose (« Nouvelle note »), quand rien d'autre à l'écran ne la propose. */
  action?: { label: string; onClick: () => void };
  /** `task` : gabarit d'une ligne de tâche (colonne de case). `list` : ligne de liste simple (Notes). */
  variant?: "task" | "list";
  className?: string;
  /** Transmise au conteneur animé : `AnimatePresence mode="popLayout"` en a besoin. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * L'état vide s'écrit, comme la page blanche du Journal : une phrase posée là
 * où serait la première ligne, sur le gabarit d'une ligne de tâche (`px-3`,
 * colonne de case de 18 px, `gap-3`) pour que le texte s'aligne sur celui des
 * tâches. Pas de pastille, pas de bloc centré.
 */
export function EmptyHint({ children, done = false, action, variant = "task", className, ref }: EmptyHintProps) {
  const task = variant === "task";
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { opacity: { duration: 0.2 }, default: spring.smooth } }}
      exit={{ opacity: 0, y: 3, transition: exitTween }}
      className={cn("flex items-start gap-3 px-3 py-2.5", className)}
    >
      {task && (
        <span aria-hidden className="mt-[2px] flex size-[18px] shrink-0 items-center justify-center">
          {done && <DoneMark />}
        </span>
      )}
      <div className={cn("min-w-0 leading-snug text-muted-foreground", task ? "text-[15px]" : "text-sm")}>
        <p>{children}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:decoration-foreground focus-visible:outline-none"
          >
            {action.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** La coche d'une tâche terminée, qui se trace à l'arrivée. */
function DoneMark() {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...spring.snappy, delay: 0.08 }}
      className="flex size-[18px] items-center justify-center rounded-full bg-brand text-brand-foreground"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M4 12.5 9 17.5 20 6"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        />
      </svg>
    </motion.span>
  );
}
