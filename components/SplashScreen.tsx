"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ListikLogoMotion } from "@/components/brand/ListikLogoMotion";
import { ONBOARDING_KEY } from "@/features/onboarding/onboarding";
import { isApplePlatform } from "@/lib/keys";

/** sessionStorage : déjà joué pendant ce lancement (un rechargement ne le rejoue pas). */
const SPLASH_KEY = "listik.splash";
/** La goutte vient de s'écraser : l'app commence à apparaître pendant qu'elle se stabilise. */
const FADE_AT_MS = 1600;
/** Jamais coincé derrière une vidéo qui ne démarre pas. */
const GIVE_UP_MS = 3000;

type Phase = "cover" | "play" | "fade" | "gone";

/**
 * L'écran d'ouverture : le logotype se pose, puis l'app apparaît en fondu. Une
 * fois par lancement, fenêtre principale seulement (monté dans (app)/layout ;
 * la capture rapide n'en fait pas partie). Un clic ou une touche le passe.
 *
 * Il ne joue pas :
 * - à la première installation (l'accueil a déjà son logo animé) : on le
 *   reconnaît à l'absence de la marque de l'accueil, quitte à le rater une fois
 *   pour quelqu'un qui avait déjà des données ;
 * - sous « réduire les animations » ;
 * - sur Mac, tant que la vidéo n'y a pas d'équivalent (voir ListikLogoMotion).
 *
 * Le premier rendu couvre déjà l'écran (il est dans le HTML statique) : l'app
 * n'apparaît pas une fraction de seconde avant lui. Toute décision se prend
 * ensuite, une fois monté.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("cover");
  const fadeTimer = useRef<number | undefined>(undefined);
  const coverRef = useRef<HTMLDivElement>(null);

  const fade = useCallback(() => setPhase((p) => (p === "cover" || p === "play" ? "fade" : p)), []);
  const drop = useCallback(() => setPhase("gone"), []);

  useEffect(() => {
    let skip = true;
    try {
      skip =
        sessionStorage.getItem(SPLASH_KEY) === "1" ||
        !localStorage.getItem(ONBOARDING_KEY) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        isApplePlatform();
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* stockage indisponible : on ne joue rien plutôt que de rejouer à chaque fois */
    }
    setPhase(skip ? "gone" : "play");
    return () => window.clearTimeout(fadeTimer.current);
  }, []);

  // Pendant la lecture seulement : un clic ou une touche le passe, et il
  // s'efface de lui-même si la vidéo ne démarre pas.
  useEffect(() => {
    if (phase !== "play") return;
    const giveUp = window.setTimeout(fade, GIVE_UP_MS);
    window.addEventListener("pointerdown", fade, true);
    window.addEventListener("keydown", fade, true);
    return () => {
      window.clearTimeout(giveUp);
      window.removeEventListener("pointerdown", fade, true);
      window.removeEventListener("keydown", fade, true);
    };
  }, [phase, fade]);

  const onPlaying = useCallback(() => {
    window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(fade, FADE_AT_MS);
  }, [fade]);

  if (phase === "gone") return null;

  return (
    <motion.div
      ref={coverRef}
      aria-hidden
      className="fixed inset-0 z-[99] grid place-items-center bg-background"
      style={{ pointerEvents: phase === "fade" ? "none" : "auto" }}
      initial={false}
      animate={{ opacity: phase === "fade" ? 0 : 1 }}
      transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={() => {
        if (phase !== "fade") return;
        // Le fondu tourne dans le moteur d'animation du navigateur, mais motion
        // laisse « opacity: 1 » écrit sur l'élément. Quand l'animation s'achève,
        // l'élément y retombe le temps d'une image, avant que React ne le
        // retire : le logo réapparaissait en plein écran par-dessus le
        // Planificateur (clignotement mesuré image par image). On écrit
        // l'opacité finale avant de le retirer.
        if (coverRef.current) coverRef.current.style.opacity = "0";
        drop();
      }}
    >
      {phase !== "cover" && (
        <ListikLogoMotion
          className="w-[min(36vw,440px)] -translate-y-[4vh]"
          onPlaying={onPlaying}
          onUnavailable={drop}
        />
      )}
    </motion.div>
  );
}
