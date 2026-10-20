"use client";

import { useRef, useState } from "react";
import { AiBrain01Icon, Notebook01Icon, Task01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils";

/** Les modes de la fenêtre rapide. La barre neutre est déjà l'Assistant ; les
 *  pastilles ne montrent que les deux outils de capture spécialisés. */
export type QuickMode = "neutre" | "tache" | "journal" | "question";

/** Impose le mode de la prochaine ouverture de la fenêtre rapide, une seule fois (payload : un mode, ou null pour annuler). */
export const QUICK_NEXT_MODE_EVENT = "quick:next-mode";

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
const FOCUSED_EXTRA_WIDTH = 44;
const GAP = 14;
const ELASTIQUE = [0.32, 1.5, 0.44, 1] as const; // --elastique de l'artifact « La fenêtre rapide ».
/** Le focus clavier : une réponse IMMÉDIATE, posée, sans rebond. L'élastique
 *  de 0,58 s sied à une goutte qui se sépare, pas à un Tab — avec lui, la
 *  pastille arrivait après le regard et rebondissait. */
const FOCUS = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

interface QuickPillsProps {
  /** Repliées (absorbées dans la barre choisie) tant qu'un mode est actif. */
  collapsed: boolean;
  onChoose: (mode: Exclude<QuickMode, "neutre">) => void;
  /** Rejoue l'entrée (la goutte qui se sépare) — change à chaque vraie réouverture. */
  entryKey: number;
  /** Diamètre d'une pastille. */
  size?: number;
  /** L'espace entre deux pastilles. */
  gap?: number;
  /** Le fond des formes. Il doit rester OPAQUE : le filtre gooey seuille l'alpha,
   *  et une forme translucide y disparaîtrait. */
  shapeClassName?: string;
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
 * l'ensemble les aurait floutées.
 *
 * Au CLAVIER, la pastille focalisée devient une capsule libellée : contraste,
 * forme et texte remplacent le ring externe. Elle s'allonge vers la droite,
 * dans le vide, sans déplacer la barre ; le libellé naît à droite de l'icône,
 * qui ne bouge pas. À la souris, un simple survol.
 */
export function QuickPills({
  collapsed,
  onChoose,
  entryKey,
  size: PILL = PILL_SIZE,
  gap: ECART = GAP,
  shapeClassName = "bg-popover",
}: QuickPillsProps) {
  const [focusedMode, setFocusedMode] = useState<QuickMode | null>(null);
  const activeFocus = collapsed ? null : focusedMode;
  const widthFor = (mode: QuickMode) =>
    activeFocus === mode ? PILL + FOCUSED_EXTRA_WIDTH : PILL;
  const leftFor = (index: number) =>
    QUICK_PILL_ITEMS.slice(0, index).reduce((left, item) => left + widthFor(item.mode) + ECART, 0);
  /** La largeur AU REPOS : celle que la rangée occupe dans la mise en page. */
  const restWidth = QUICK_PILL_ITEMS.length * PILL + (QUICK_PILL_ITEMS.length - 1) * ECART;
  /** La place qu'il faut aux couches, allongement au focus compris. */
  const fullWidth = restWidth + FOCUSED_EXTRA_WIDTH;

  // Le geste qui a changé l'état décide de l'animation : se replier ou
  // ressortir, c'est la goutte (élastique, en cascade) ; un focus, c'est la
  // réponse courte, d'un seul tenant. On le sait en comparant au rendu
  // précédent.
  const replieAvant = useRef(collapsed);
  const parFocus = replieAvant.current === collapsed;
  replieAvant.current = collapsed;
  const transition = (i: number) =>
    parFocus
      ? FOCUS
      : {
          duration: 0.58,
          ease: ELASTIQUE,
          delay: collapsed ? (QUICK_PILL_ITEMS.length - 1 - i) * 0.05 : i * 0.05,
        };

  return (
    <motion.div
      className="relative shrink-0"
      // La rangée ne change de largeur QUE pour se replier ou ressortir. La
      // pastille qui s'allonge au focus déborde à droite, dans le vide :
      // élargir la rangée déplaçait tout le groupe, barre comprise, puisqu'il
      // est centré — la barre glissait à chaque Tab.
      animate={{ width: collapsed ? 0 : restWidth, opacity: collapsed ? 0 : 1 }}
      transition={{ duration: 0.58, ease: ELASTIQUE }}
      style={{ height: PILL, pointerEvents: collapsed ? "none" : "auto" }}
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

      {/* Le masque ne couvre que les formes, en laissant la place de
          l'allongement. Les boutons restent hors de ce clip. */}
      <div aria-hidden className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: fullWidth }}>
        <div className="absolute inset-0" style={{ filter: "url(#quick-gooey)" }}>
          {QUICK_PILL_ITEMS.map((item, i) => (
            <motion.div
              key={`${entryKey}-${item.mode}-forme`}
              className={cn("absolute top-0 rounded-full", shapeClassName)}
              style={{ height: PILL }}
              initial={{ left: 0, scale: 0.3 }}
              animate={{
                left: collapsed ? 0 : leftFor(i),
                width: collapsed ? PILL : widthFor(item.mode),
                scale: collapsed && i > 0 ? 1 - i * 0.14 : 1,
              }}
              transition={transition(i)}
            />
          ))}
        </div>
      </div>

      {/* Icônes : nettes, cliquables, jamais filtrées. */}
      <div className="absolute inset-y-0 left-0" style={{ width: fullWidth }}>
        {QUICK_PILL_ITEMS.map((item, i) => {
          const focused = activeFocus === item.mode;
          return (
            <motion.button
              key={`${entryKey}-${item.mode}-icone`}
              type="button"
              aria-label={item.label}
              tabIndex={collapsed ? -1 : 0}
              // Chaque pastille est une forme cliquable de la toile de la
              // barre rapide (voir src-tauri/src/cadre), à sa taille du
              // moment. Repliée, elle est invisible : elle ne doit plus
              // retenir la souris.
              data-forme={collapsed ? undefined : ""}
              data-focus={focused ? "" : undefined}
              onClick={() => onChoose(item.mode)}
              // Le CLAVIER seulement : un clic donne aussi le focus, et la
              // pastille s'allongeait sous la souris juste avant de changer
              // de mode — un sursaut pour rien.
              onFocus={(e) => {
                if (e.currentTarget.matches(":focus-visible")) setFocusedMode(item.mode);
              }}
              onBlur={() => setFocusedMode(null)}
              className={cn(
                "absolute top-0 flex items-center justify-start overflow-hidden rounded-full outline-none",
                "bg-transparent transition-colors duration-200 hover:bg-foreground/[0.05] data-[focus]:bg-brand-soft",
                "forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2",
              )}
              style={{ height: PILL, color: "var(--brand-text)" }}
              initial={{ left: 0, opacity: 0, width: PILL }}
              animate={{
                left: collapsed ? 0 : leftFor(i),
                width: collapsed ? PILL : widthFor(item.mode),
                opacity: collapsed ? 0 : 1,
              }}
              transition={transition(i)}
            >
              {/* L'icône garde sa place, au centre du rond : elle ne glisse pas
                  quand la pastille s'allonge. */}
              <span className="grid shrink-0 place-items-center" style={{ width: PILL, height: PILL }}>
                <AppIcon icon={item.icon} size={21} strokeWidth={1.9} />
              </span>
              <AnimatePresence initial={false}>
                {focused && (
                  <motion.span
                    key="libelle"
                    // Il entre quand la place est presque faite, et sort
                    // aussitôt : un libellé tranché par le bord qui se
                    // referme se lirait comme un défaut.
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0, transition: { ...FOCUS, delay: 0.08 } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    className="-ml-2.5 pr-4 text-[10px] font-semibold whitespace-nowrap tracking-[0.08em] text-foreground uppercase"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
