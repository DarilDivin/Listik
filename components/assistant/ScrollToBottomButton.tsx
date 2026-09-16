"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exitTween, spring } from "@/lib/motion";

/**
 * `MessageScrollerButton` du template, remonté à notre grammaire : il entre
 * et sort en ressort (§3) au lieu des transitions CSS du registre.
 */
export function ScrollToBottomButton({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.95, transition: exitTween }}
          transition={spring.snappy}
          className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClick}
            aria-label="Revenir au dernier échange"
            className="pointer-events-auto rounded-full bg-popover shadow-[0_2px_10px_-2px_rgba(0,0,0,0.18)]"
          >
            <ArrowDown />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
