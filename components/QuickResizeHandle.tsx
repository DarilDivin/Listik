"use client";

import { useRef } from "react";

export interface Taille {
  width: number;
  height: number;
}

interface QuickResizeHandleProps {
  taille: Taille;
  min: Taille;
  max: Taille;
  onChange: (taille: Taille) => void;
  /** Le glissé commence / finit : la page suspend alors l'animation de la
   *  forme, qui doit suivre la souris sans retard. */
  onGlisse: (enCours: boolean) => void;
  /** Double-clic : retour à la taille par défaut. */
  onReinitialiser: () => void;
}

const PAS_CLAVIER = 16;

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * La poignée de redimensionnement des panneaux de la barre rapide (réponse,
 * Journal), au coin bas-droit.
 *
 * Les panneaux étaient redimensionnés par les bords de la FENÊTRE ; ils sont
 * maintenant des formes posées dans une toile plus grande, et c'est cette
 * poignée qui les tire.
 *
 * Le panneau est CENTRÉ sous la barre : il grandit des deux côtés à la fois.
 * Le déplacement horizontal compte donc double — sans ça, le coin prendrait
 * du retard sur la souris. Vers le bas, il suit tel quel (le haut est fixe).
 *
 * Au clavier : les flèches, par pas de 16 px.
 */
export function QuickResizeHandle({
  taille,
  min,
  max,
  onChange,
  onGlisse,
  onReinitialiser,
}: QuickResizeHandleProps) {
  const depart = useRef<{ x: number; y: number; taille: Taille } | null>(null);

  const ajuster = (largeur: number, hauteur: number) =>
    onChange({
      width: Math.round(borner(largeur, min.width, max.width)),
      height: Math.round(borner(hauteur, min.height, max.height)),
    });

  const finir = () => {
    if (!depart.current) return;
    depart.current = null;
    onGlisse(false);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Redimensionner le panneau"
      title="Glisser pour redimensionner — double-clic pour la taille par défaut"
      tabIndex={0}
      className="group absolute right-1 bottom-1 z-20 grid size-4 cursor-nwse-resize touch-none place-items-center rounded-sm text-muted-foreground/45 outline-none transition-colors hover:text-muted-foreground focus-visible:text-foreground"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        depart.current = { x: e.clientX, y: e.clientY, taille };
        onGlisse(true);
      }}
      onPointerMove={(e) => {
        const d = depart.current;
        if (!d) return;
        ajuster(d.taille.width + 2 * (e.clientX - d.x), d.taille.height + (e.clientY - d.y));
      }}
      onPointerUp={finir}
      onPointerCancel={finir}
      onLostPointerCapture={finir}
      onDoubleClick={onReinitialiser}
      onKeyDown={(e) => {
        const delta = {
          ArrowLeft: [-PAS_CLAVIER, 0],
          ArrowRight: [PAS_CLAVIER, 0],
          ArrowUp: [0, -PAS_CLAVIER],
          ArrowDown: [0, PAS_CLAVIER],
        }[e.key];
        if (!delta) return;
        e.preventDefault();
        ajuster(taille.width + delta[0], taille.height + delta[1]);
      }}
    >
      {/* Deux traits parallèles à l'arrondi du coin : l'idiome des poignées
          de fenêtre, discret tant qu'on ne le survole pas. */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M9 3 L3 9 M9 6.5 L6.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
