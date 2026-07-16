"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { exitTween, revealVariants, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SECTION_STYLE_OPTIONS,
  SECTION_STYLES,
  useUIPrefs,
  type SectionKey,
} from "@/components/ui-prefs";

export type SectionTone = "default" | "today" | "danger";

interface SectionCardProps {
  title: string;
  count: number;
  tone?: SectionTone;
  delay?: number;
  className?: string;
  children: ReactNode;
  /** Active le sélecteur de style d'affichage pour cette section. */
  sectionKey?: SectionKey;
  /** Cette section est actuellement en mode « portail » (prend toute la colonne). */
  portalActive?: boolean;
  /** Ferme le mode portail (bouton retour). */
  onExitPortal?: () => void;
  /** Ouvre le mode portail (appelé quand le style actif est « portail »). */
  onEnterPortal?: () => void;
}

/**
 * Groupe temporel de tâches (En retard, Aujourd'hui…) : posé directement sur
 * la page, sans carte ni ombre — séparé du groupe précédent par une simple
 * ligne hairline. L'en-tête encode le moment par un point : rouge (retard),
 * accent (aujourd'hui), neutre (à venir). Si `sectionKey` est fourni, un petit
 * bouton révélé au survol permet de choisir la mise en forme de la section.
 *
 * En mode portail, la section GARDE son nœud (même clé React côté page) : elle
 * morphe vers le haut via `layout="position"`, le titre grossit sur place
 * (fontSize animée — jamais de swap d'élément, qui ferait sauter le texte) et
 * le bouton retour éclot à gauche.
 */
export function SectionCard({
  title,
  count,
  tone = "default",
  delay = 0,
  className,
  children,
  sectionKey,
  portalActive = false,
  onExitPortal,
  onEnterPortal,
}: SectionCardProps) {
  const { sectionStyles, setSectionStyle } = useUIPrefs();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const dotClass =
    tone === "danger"
      ? "bg-destructive"
      : tone === "today"
        ? "bg-brand"
        : "bg-muted-foreground/35";

  const labelClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "today"
        ? "text-foreground"
        : "text-muted-foreground";

  const activeStyle = sectionKey ? sectionStyles[sectionKey] : "list";
  const options = sectionKey ? SECTION_STYLE_OPTIONS[sectionKey] : [];
  const isPortalLauncher =
    activeStyle === "portal" && !portalActive && Boolean(onEnterPortal);
  // Un style non standard reste signalé en permanence : sans repère visible,
  // une section compressée (Horizon, Loupe…) semble « cassée sans raison ».
  const styleIsCustom = activeStyle !== "list";
  const activeStyleLabel =
    SECTION_STYLES.find((s) => s.id === activeStyle)?.label ?? activeStyle;

  return (
    <motion.section
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay } }}
      exit={{ opacity: 0, y: 6, transition: exitTween }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={cn(
        "border-t border-border/60 pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 px-3 pb-2">
        <AnimatePresence initial={false}>
          {portalActive && onExitPortal && (
            <motion.button
              key="back"
              type="button"
              onClick={onExitPortal}
              variants={revealVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              whileTap={{ scale: 0.9 }}
              aria-label="Retour"
              className="-ml-1 mr-0.5 grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </motion.button>
          )}
        </AnimatePresence>

        <motion.span
          layout="position"
          aria-hidden
          className={cn("size-2 rounded-full", dotClass)}
          style={
            tone === "today"
              ? { boxShadow: "0 0 0 4px var(--brand-soft)" }
              : undefined
          }
        />

        {/* Un seul élément pour le titre dans tous les modes : le passage en
            portail anime la taille du même nœud au lieu d'en monter un autre. */}
        <motion.button
          type="button"
          layout="position"
          disabled={!isPortalLauncher}
          onClick={isPortalLauncher ? onEnterPortal : undefined}
          whileTap={isPortalLauncher ? { scale: 0.97 } : undefined}
          initial={false}
          animate={{ fontSize: portalActive ? "18px" : "13px" }}
          transition={spring.smooth}
          className={cn(
            "group/title inline-flex items-center gap-1 font-semibold tracking-[-0.005em] transition-colors",
            portalActive ? "text-foreground" : labelClass,
            isPortalLauncher ? "hover:text-foreground" : "cursor-default",
          )}
        >
          {title}
          <AnimatePresence initial={false}>
            {isPortalLauncher && (
              <motion.span
                key="chevron"
                variants={revealVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="text-muted-foreground/50 transition-transform duration-200 group-hover/title:translate-x-0.5"
              >
                <ChevronRight size={12} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/50">
          <AnimatedNumber value={count} />
        </span>

        {sectionKey && !portalActive && (
          <AnimatePresence>
            {(hovered || menuOpen || styleIsCustom) && (
              <motion.span variants={revealVariants} initial="initial" animate="animate" exit="exit">

                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Mise en forme de la section"
                          className={cn(
                            "rounded-md p-1 transition-colors hover:bg-foreground/[0.06] hover:text-foreground data-[state=open]:bg-foreground/[0.06]",
                            styleIsCustom ? "text-brand" : "text-muted-foreground",
                          )}
                        >
                          <SlidersHorizontal size={13} />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {styleIsCustom
                        ? `Mise en forme : ${activeStyleLabel}`
                        : "Mise en forme"}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuRadioGroup
                      value={activeStyle}
                      onValueChange={(value) =>
                        setSectionStyle(sectionKey, value as (typeof options)[number])
                      }
                    >
                      {SECTION_STYLES.filter((s) => options.includes(s.id)).map((s) => (
                        <DropdownMenuRadioItem key={s.id} value={s.id}>
                          {s.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.span>
            )}
          </AnimatePresence>
        )}
      </h3>

      <div>{children}</div>
    </motion.section>
  );
}
