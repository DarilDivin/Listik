"use client";

import { ListTodo, NotebookPen, Sparkles, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Les trois barres entre lesquelles la fenêtre rapide choisit. */
export type QuickMode = "tache" | "journal" | "question";

const PILL_SIZE = 52; // ≈ badge (size-9=36px) + padding (p-2×2=16px) de BarreTache au repos.
const GAP = 14;

const ITEMS: { mode: QuickMode; label: string; icon: LucideIcon; color: string; soft: string }[] = [
  { mode: "tache", label: "Tâche", icon: ListTodo, color: "#0284c7", soft: "rgb(14 165 233 / 0.12)" },
  { mode: "journal", label: "Journal", icon: NotebookPen, color: "#b45309", soft: "rgb(245 158 11 / 0.12)" },
  { mode: "question", label: "Question", icon: Sparkles, color: "#7c3aed", soft: "rgb(139 92 246 / 0.12)" },
];

interface QuickPillsProps {
  mode: QuickMode;
  onChoose: (mode: QuickMode) => void;
  /** Rejoue l'entrée (la goutte qui se sépare) — change à chaque vraie réouverture. */
  entryKey: number;
}

/**
 * Les trois pastilles de la fenêtre rapide — nées d'une même goutte à
 * l'ouverture (voir l'artifact « La fenêtre rapide », docs/ROADMAP-BARRES.md
 * étape 4). Toujours visibles et cliquables (simplification assumée : dans
 * l'artifact elles s'absorbaient dans la barre choisie et ne redevenaient
 * accessibles qu'en rétablissant le jeton — reproduire ce va-et-vient
 * demandait un point de retour dans chacune des trois barres réelles, qui
 * n'en ont pas et ne doivent pas en savoir plus sur la fenêtre rapide qui
 * les héberge). La pastille active reste teintée, un simple indicateur
 * d'état plutôt qu'une disparition.
 *
 * Deux couches superposées, comme dans l'artifact : les FORMES passent par
 * le filtre gooey (qui fond les silhouettes proches à l'ouverture), les
 * ICÔNES (vrais boutons, cliquables) restent nettes par-dessus. Filtrer
 * l'ensemble les aurait floutées.
 */
export function QuickPills({ mode, onChoose, entryKey }: QuickPillsProps) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: ITEMS.length * PILL_SIZE + (ITEMS.length - 1) * GAP, height: PILL_SIZE }}
    >
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
        <filter id="quick-gooey">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="flou" />
          <feColorMatrix
            in="flou"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12"
            result="seuil"
          />
          <feComposite in="SourceGraphic" in2="seuil" operator="atop" />
        </filter>
      </svg>

      {/* Formes : le fond, passé au filtre — c'est lui qui « fond » à l'ouverture. */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center"
        style={{ gap: GAP, filter: "url(#quick-gooey)" }}
      >
        {ITEMS.map((item, i) => (
          <motion.div
            key={`${entryKey}-${item.mode}-forme`}
            className="shrink-0 rounded-full bg-popover"
            style={{ width: PILL_SIZE, height: PILL_SIZE }}
            initial={{ scale: 0.3, x: -(i + 1) * (PILL_SIZE * 0.6) }}
            animate={{ scale: 1, x: 0 }}
            transition={{
              duration: 0.52,
              ease: [0.32, 1.5, 0.44, 1], // --elastique de l'artifact
              delay: i * 0.05,
            }}
          />
        ))}
      </div>

      {/* Icônes : nettes, cliquables, jamais filtrées. */}
      <div className="absolute inset-0 flex items-center" style={{ gap: GAP }}>
        {ITEMS.map((item, i) => {
          const Icon = item.icon;
          const active = mode === item.mode;
          return (
            <motion.button
              key={`${entryKey}-${item.mode}-icone`}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onChoose(item.mode)}
              className={cn(
                "grid shrink-0 place-items-center rounded-full outline-none transition-colors",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
              style={{
                width: PILL_SIZE,
                height: PILL_SIZE,
                color: item.color,
                backgroundColor: active ? item.soft : "transparent",
              }}
              initial={{ scale: 0.3, opacity: 0, x: -(i + 1) * (PILL_SIZE * 0.6) }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              transition={{
                duration: 0.52,
                ease: [0.32, 1.5, 0.44, 1],
                delay: i * 0.05,
              }}
            >
              <Icon size={21} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
