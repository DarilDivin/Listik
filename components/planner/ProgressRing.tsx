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
  /**
   * Repère sur la circonférence, entre 0 et 1 — où en est la JOURNÉE.
   *
   * Comparé au remplissage (les tâches faites), il dit d'un coup d'œil si l'on
   * avance au rythme du temps ou non : c'est ce que l'horloge du système ne
   * peut pas dire. Omis, l'anneau reste exactement ce qu'il était.
   */
  marker?: number;
  /**
   * Variante du repère : au lieu d'un point, la part de journée écoulée est
   * peinte sur la PISTE elle-même, en arc discret. L'anneau n'est alors jamais
   * creux — l'état « zéro fait », qui est celui de tout début de journée,
   * cesse de ressembler à un chargement.
   *
   * `marker` et `dayArc` disent la même chose de deux façons : on n'en pose
   * qu'un à la fois.
   */
  dayArc?: number;
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
  marker,
  dayArc,
  children,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const radius = (size - strokeWidth) / 2;

  // Position du repère sur le cercle. Le SVG est tourné de -90°, donc l'angle
  // se compte déjà depuis midi (haut du cadran), dans le sens horaire.
  const markerAngle =
    marker === undefined ? null : Math.min(Math.max(marker, 0), 1) * 2 * Math.PI;
  const markerPoint =
    markerAngle === null
      ? null
      : {
          x: size / 2 + radius * Math.cos(markerAngle),
          y: size / 2 + radius * Math.sin(markerAngle),
        };

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
        {dayArc !== undefined && (
          // Sous la valeur, jamais au-dessus : le temps situe, il ne prétend
          // pas au même poids que ce qui est fait.
          <motion.circle
            aria-hidden
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="color-mix(in oklch, var(--muted-foreground) 32%, transparent)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: Math.max(Math.min(Math.max(dayArc, 0), 1), 0.0001) }}
            transition={spring.gentle}
          />
        )}
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
        {markerPoint && (
          // Un point sobre, pas un second anneau : il situe l'instant sur le
          // cadran sans prétendre au même poids que la progression.
          <motion.circle
            aria-hidden
            cx={markerPoint.x}
            cy={markerPoint.y}
            r={Math.max(strokeWidth * 0.42, 1.6)}
            fill="var(--muted-foreground)"
            initial={false}
            animate={{ cx: markerPoint.x, cy: markerPoint.y, opacity: 0.75 }}
            transition={spring.gentle}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
