"use client";

import { useEffect, useState } from "react";
import { REFLECTION_STYLES, useUIPrefs, type ReflectionStyleId } from "@/components/ui-prefs";
import { ReflectionMark } from "@/components/reflection/ReflectionMark";

/**
 * La bulle de réflexion (mode Question, `app/quick/page.tsx`) — un cercle de
 * 64px. Les douze présences, Fusion comprise, emploient leur illustration
 * dédiée plutôt que l’ancienne animation des pastilles. Le choix vit dans
 * Réglages → Personnalisation et suit l’accent actif de l’application
 * (docs/ROADMAP-BARRES.md, étape 4).
 *
 * Pas de bouton d'annuler ici, volontairement (décision utilisateur,
 * 2026-09-16) : c'est un processus de réflexion, pas une action qu'on
 * interrompt. À rouvrir si l'usage réel montre que la latence (~12s) le
 * demande.
 */
export function QuickBubble() {
  const { reflection } = useUIPrefs();
  // La bulle est montée après la question, donc elle relit la préférence au
  // moment précis où elle devient visible. C’est le dernier filet pour une
  // fenêtre quick qui était cachée pendant un changement de réglage.
  const [reflectionAtStart, setReflectionAtStart] = useState<ReflectionStyleId>(reflection);

  useEffect(() => {
    const stored = localStorage.getItem("listik.reflection");
    const selected = REFLECTION_STYLES.find((style) => style.id === stored)?.id;
    setReflectionAtStart(selected ?? reflection);
  }, [reflection]);

  return (
    <div className="grid h-16 w-16 place-items-center">
      <ReflectionMark preset={reflectionAtStart} animate />
    </div>
  );
}
