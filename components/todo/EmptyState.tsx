"use client";

import { motion } from "motion/react";
import { CircleCheckBig } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { exitTween, spring } from "@/lib/motion";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

/** État vide d'une liste de tâches : entrée douce, icône calme, invitation à agir. */
export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: spring.smooth }}
      exit={{ opacity: 0, y: 5, transition: exitTween }}
    >
      <Empty className="border-none py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="rounded-2xl bg-brand-soft text-brand">
            <CircleCheckBig />
          </EmptyMedia>
          <EmptyTitle className="text-foreground">{title}</EmptyTitle>
          {subtitle && <EmptyDescription>{subtitle}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    </motion.div>
  );
}
