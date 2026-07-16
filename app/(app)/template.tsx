"use client";

import { motion } from "motion/react";

/**
 * Transition de page : chaque navigation remonte ce template → le contenu
 * entre par un fondu + léger glissement, façon changement de vue macOS.
 * (Opacité + y uniquement : au repos, motion retire le transform, donc les
 * éléments `sticky`/`backdrop-blur` internes se comportent normalement.)
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="h-full min-h-0"
    >
      {children}
    </motion.div>
  );
}
