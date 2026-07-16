"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

interface ProgressRingProps {
  /** Progression entre 0 et 1. */
  progress: number;
  /** Diamètre en px. */
  size?: number;
  strokeWidth?: number;
  /** Contenu centré dans l'anneau (pourcentage, icône…). */
  children?: ReactNode;
}

/**
 * Anneau de progression SVG : la piste est un cercle discret, la valeur se
 * remplit avec une physique de ressort (léger dépassement, façon Apple Watch).
 */
export function ProgressRing({
  progress,
  size = 92,
  strokeWidth = 9,
  children,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const radius = (size - strokeWidth) / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={false}
          animate={{
            pathLength: Math.max(clamped, 0.0001),
            opacity: clamped > 0 ? 1 : 0,
          }}
          transition={spring.smooth}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
