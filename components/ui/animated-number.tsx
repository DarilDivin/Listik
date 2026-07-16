"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/**
 * Chiffre qui « roule » vers sa nouvelle valeur avec une physique de ressort
 * (ticker). À utiliser avec des chiffres tabulaires pour éviter tout saut.
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const raw = useMotionValue(value);
  const smoothed = useSpring(raw, { stiffness: 190, damping: 28 });
  const display = useTransform(smoothed, (v) => Math.round(v).toString());

  useEffect(() => {
    raw.set(value);
  }, [value, raw]);

  return <motion.span className={className}>{display}</motion.span>;
}
