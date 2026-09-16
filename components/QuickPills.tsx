"use client";

import { ListTodo, NotebookPen, Sparkles, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Les trois barres entre lesquelles la fenêtre rapide choisit, plus le
 *  neutre : rien n'est encore choisi, la barre est ouverte à tout. */
export type QuickMode = "neutre" | "tache" | "journal" | "question";

export const QUICK_ITEMS: {
  mode: Exclude<QuickMode, "neutre">;
  mot: string;
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { mode: "tache", mot: "tâche", label: "Tâche", icon: ListTodo, color: "#0284c7" },
  { mode: "journal", mot: "journal", label: "Journal", icon: NotebookPen, color: "#b45309" },
  { mode: "question", mot: "question", label: "Question", icon: Sparkles, color: "#7c3aed" },
];

const PILL_SIZE = 52; // ≈ badge (size-9=36px) + padding (p-2×2=16px) de BarreTache au repos.
const GAP = 14;
const ELASTIQUE = [0.32, 1.5, 0.44, 1] as const; // --elastique de l'artifact « La fenêtre rapide ».

interface QuickPillsProps {
  /** Repliées (absorbées dans la barre choisie) tant qu'un mode est actif. */
  collapsed: boolean;
  onChoose: (mode: Exclude<QuickMode, "neutre">) => void;
  /** Rejoue l'entrée (la goutte qui se sépare) — change à chaque vraie réouverture. */
  entryKey: number;
}

/**
 * Les trois pastilles de la fenêtre rapide — nées d'une même goutte à
 * l'ouverture, et qui s'y refondent dès qu'un mode est choisi (voir
 * l'artifact « La fenêtre rapide », docs/ROADMAP-BARRES.md étape 4). Le seul
 * chemin de retour est l'icône affichée dans la barre active elle-même
 * (posée par `app/quick/page.tsx` via la prop `leading` de chaque barre) :
 * cliquer dessus repose `collapsed=false` et les fait ressortir.
 *
 * Deux couches superposées, comme dans l'artifact : les FORMES passent par
 * le filtre gooey (qui fond les silhouettes proches pendant la transition),
 * les ICÔNES (vrais boutons, cliquables) restent nettes par-dessus. Filtrer
 * l'ensemble les aurait floutées.
 */
export function QuickPills({ collapsed, onChoose, entryKey }: QuickPillsProps) {
  const expandedWidth = QUICK_ITEMS.length * PILL_SIZE + (QUICK_ITEMS.length - 1) * GAP;

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden"
      animate={{ width: collapsed ? 0 : expandedWidth, opacity: collapsed ? 0 : 1 }}
      transition={{ duration: 0.52, ease: ELASTIQUE }}
      style={{ height: PILL_SIZE, pointerEvents: collapsed ? "none" : "auto" }}
    >
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
        <filter id="quick-gooey">
          {/* Metaballs : on floute, puis on durcit l'alpha. Deux formes qui se
              frôlent fusionnent, et se séparent en tirant un pont. */}
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

      {/* Formes : passées au filtre gooey — c'est elles qui fondent à l'ouverture/fermeture. */}
      <div aria-hidden className="absolute inset-0" style={{ filter: "url(#quick-gooey)" }}>
        {QUICK_ITEMS.map((item, i) => (
          <motion.div
            key={`${entryKey}-${item.mode}-forme`}
            className="absolute top-0 rounded-full bg-popover"
            style={{ width: PILL_SIZE, height: PILL_SIZE }}
            initial={{ left: 0, scale: 0.3 }}
            animate={{
              left: collapsed ? 0 : i * (PILL_SIZE + GAP),
              scale: collapsed && i > 0 ? 1 - i * 0.14 : 1,
            }}
            transition={{
              duration: 0.52,
              ease: ELASTIQUE,
              delay: collapsed ? (QUICK_ITEMS.length - 1 - i) * 0.05 : i * 0.05,
            }}
          />
        ))}
      </div>

      {/* Icônes : nettes, cliquables, jamais filtrées. */}
      <div className="absolute inset-0">
        {QUICK_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={`${entryKey}-${item.mode}-icone`}
              type="button"
              title={item.label}
              aria-label={item.label}
              tabIndex={collapsed ? -1 : 0}
              onClick={() => onChoose(item.mode)}
              className={cn(
                "absolute top-0 grid place-items-center rounded-full outline-none",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
              style={{ width: PILL_SIZE, height: PILL_SIZE, color: item.color }}
              initial={{ left: 0, opacity: 0 }}
              animate={{
                left: collapsed ? 0 : i * (PILL_SIZE + GAP),
                opacity: collapsed ? 0 : 1,
              }}
              transition={{
                duration: 0.52,
                ease: ELASTIQUE,
                delay: collapsed ? (QUICK_ITEMS.length - 1 - i) * 0.05 : i * 0.05,
              }}
            >
              <Icon size={21} />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
