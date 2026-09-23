"use client";

import { useState } from "react";
import { AiBrain01Icon, Notebook01Icon, Task01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils";

/** Les modes de la fenêtre rapide. La barre neutre est déjà l'Assistant ; les
 *  pastilles ne montrent que les deux outils de capture spécialisés. */
export type QuickMode = "neutre" | "tache" | "journal" | "question";

export const QUICK_ITEMS: {
  mode: Exclude<QuickMode, "neutre">;
  mot: string;
  label: string;
  icon: IconSvgElement;
}[] = [
  { mode: "tache", mot: "tâche", label: "Tâche", icon: Task01Icon },
  { mode: "journal", mot: "journal", label: "Journal", icon: Notebook01Icon },
  { mode: "question", mot: "question", label: "Question", icon: AiBrain01Icon },
];

// La barre neutre EST déjà l'Assistant. Les pastilles ne montrent donc que
// les deux outils qui changent réellement le type de capture.
const QUICK_PILL_ITEMS = QUICK_ITEMS.filter((item) => item.mode !== "question");

const PILL_SIZE = 52; // ≈ badge (size-9=36px) + padding (p-2×2=16px) de BarreTache au repos.
const FOCUSED_PILL_WIDTH = 96;
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
 * Les deux pastilles de la fenêtre rapide — nées d'une même goutte à
 * l'ouverture, et qui s'y refondent dès qu'un mode est choisi (voir
 * l'artifact « La fenêtre rapide », docs/ROADMAP-BARRES.md étape 4). Le seul
 * chemin de retour est l'icône affichée dans la barre active elle-même
 * (posée par `app/quick/page.tsx` via la prop `leading` de chaque barre) :
 * cliquer dessus repose `collapsed=false` et les fait ressortir.
 *
 * Deux couches superposées, comme dans l'artifact : les FORMES passent par
 * le filtre gooey (qui fond les silhouettes proches pendant la transition),
 * les ICÔNES (vrais boutons, cliquables) restent nettes par-dessus. Filtrer
 * l'ensemble les aurait floutées. Au clavier, la pastille devient une capsule
 * libellée : contraste, forme et texte remplacent le ring externe.
 */
export function QuickPills({ collapsed, onChoose, entryKey }: QuickPillsProps) {
  const [focusedMode, setFocusedMode] = useState<QuickMode | null>(null);
  const activeFocus = collapsed ? null : focusedMode;
  const widthFor = (mode: QuickMode) =>
    activeFocus === mode ? FOCUSED_PILL_WIDTH : PILL_SIZE;
  const leftFor = (index: number) =>
    QUICK_PILL_ITEMS.slice(0, index).reduce((left, item) => left + widthFor(item.mode) + GAP, 0);
  const expandedWidth = QUICK_PILL_ITEMS.reduce(
    (width, item, index) => width + widthFor(item.mode) + (index ? GAP : 0),
    0,
  );

  return (
    <motion.div
      className="relative shrink-0"
      animate={{ width: collapsed ? 0 : expandedWidth, opacity: collapsed ? 0 : 1 }}
      transition={{ duration: 0.58, ease: ELASTIQUE }}
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

      {/* Le masque ne couvre que les formes. Les boutons restent hors de ce
          clip : leur ring clavier peut donc dépasser sans être sectionné. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ filter: "url(#quick-gooey)" }}>
          {QUICK_PILL_ITEMS.map((item, i) => (
            <motion.div
              key={`${entryKey}-${item.mode}-forme`}
              className="absolute top-0 rounded-full bg-popover"
              style={{ height: PILL_SIZE }}
              initial={{ left: 0, scale: 0.3 }}
              animate={{
                left: collapsed ? 0 : leftFor(i),
                width: collapsed ? PILL_SIZE : widthFor(item.mode),
                scale: collapsed && i > 0 ? 1 - i * 0.14 : 1,
              }}
              transition={{
                duration: 0.58,
                ease: ELASTIQUE,
                delay: collapsed ? (QUICK_PILL_ITEMS.length - 1 - i) * 0.05 : i * 0.05,
              }}
            />
          ))}
        </div>
      </div>

      {/* Icônes : nettes, cliquables, jamais filtrées. */}
      <div className="absolute inset-0">
        {QUICK_PILL_ITEMS.map((item, i) => {
          const focused = activeFocus === item.mode;
          return (
            <motion.button
              key={`${entryKey}-${item.mode}-icone`}
              type="button"
              aria-label={item.label}
              tabIndex={collapsed ? -1 : 0}
              onClick={() => onChoose(item.mode)}
              onFocus={() => setFocusedMode(item.mode)}
              onBlur={() => setFocusedMode(null)}
              className={cn(
                "absolute top-0 flex items-center justify-center gap-1.5 rounded-full outline-none",
                "forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2",
              )}
              style={{ height: PILL_SIZE, color: "var(--brand)" }}
              initial={{ left: 0, opacity: 0, width: PILL_SIZE }}
              animate={{
                left: collapsed ? 0 : leftFor(i),
                width: collapsed ? PILL_SIZE : widthFor(item.mode),
                opacity: collapsed ? 0 : 1,
                backgroundColor: focused ? "var(--brand-soft)" : "transparent",
              }}
              transition={{
                duration: 0.58,
                ease: ELASTIQUE,
                delay: collapsed ? (QUICK_PILL_ITEMS.length - 1 - i) * 0.05 : i * 0.05,
              }}
            >
              <span className="relative grid size-[21px] shrink-0 place-items-center">
                <AppIcon icon={item.icon} size={21} strokeWidth={1.9} />
              </span>
              {focused && (
                <span className="text-[10px] font-semibold tracking-[0.08em] text-foreground uppercase">
                  {item.label}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
