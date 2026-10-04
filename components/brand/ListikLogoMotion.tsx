"use client";

import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ListikLogotype } from "@/components/brand/ListikLogo";
import { cn } from "@/lib/utils";

/*
 * Le logotype qui se pose : les lettres font leur mise au point, la plume vient
 * se planter à la place du « ! », la goutte tombe. C'est la coupe « splash » de
 * l'animation du logo, rendue par Remotion (motion/) en WebM transparent, une
 * vidéo par thème (couleur de texte de l'app). La dernière image est le logo au
 * repos.
 *
 * La vidéo déborde de la boîte du logo (la plume arrive d'en haut à droite). On
 * la cale pour que son logo tombe exactement sur la boîte, qui a les
 * proportions de `ListikLogotype` : la mise en page ne bouge pas, et le logo
 * statique prend la même place quand l'animation est indisponible (réduire les
 * animations, vidéo illisible).
 *
 * Géométrie : SPLASH_GEOMETRY et `framing` dans motion/src/LogoSting.tsx
 * (cadre 1600 × 900, logo sur 56 % de la largeur, centré). À changer ensemble.
 */
const CANVAS = { width: 1600, height: 900, fit: 0.56 };
/** La boîte du logo dans la composition (LOGO_VIEW), centrée dans le cadre. */
const LOGO_VIEW = { width: 4415.2, height: 1538 };
const LOGO_TOP = CANVAS.height / 2 - (LOGO_VIEW.height / 2) * ((CANVAS.width * CANVAS.fit) / LOGO_VIEW.width);

const VIDEO_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: `${100 / CANVAS.fit}%`,
  maxWidth: "none",
  transform: `translate(${(-(1 - CANVAS.fit) / 2) * 100}%, ${(-LOGO_TOP / CANVAS.height) * 100}%)`,
  pointerEvents: "none",
};

/** Proportions de `ListikLogotype` (son viewBox). */
const BOX_STYLE: CSSProperties = { aspectRatio: "4415.2 / 1508.5" };

type Props = {
  /** Taille de la boîte du logo : une hauteur ou une largeur suffit. */
  className?: string;
  /** Délai avant le départ, en secondes. */
  delay?: number;
  /** La vidéo a démarré. */
  onPlaying?: () => void;
  /** L'animation n'a pas pu se jouer (le logo statique est affiché à sa place). */
  onUnavailable?: () => void;
};

export function ListikLogoMotion({ className, delay = 0, onPlaying, onUnavailable }: Props) {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  // Le thème n'est connu qu'une fois monté : rien avant, pour ne pas désaccorder l'hydratation.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fallback = failed || reduceMotion === true;
  const variant = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (fallback) onUnavailable?.();
  }, [fallback, onUnavailable]);

  useEffect(() => {
    const video = videoRef.current;
    if (!mounted || fallback || !video) return;
    // `muted` posé à la main : c'est lui qui autorise la lecture sans geste.
    video.muted = true;
    const timer = window.setTimeout(() => {
      video.play().catch(() => setFailed(true));
    }, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [mounted, fallback, variant, delay]);

  if (fallback) return <ListikLogotype className={cn("w-auto text-foreground", className)} />;

  return (
    <div role="img" aria-label="Listik" className={cn("relative", className)} style={BOX_STYLE}>
      {mounted && (
        <video
          key={variant}
          ref={videoRef}
          src={`/brand/listik-splash-${variant}.webm`}
          muted
          playsInline
          preload="auto"
          aria-hidden
          style={VIDEO_STYLE}
          onPlaying={onPlaying}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
