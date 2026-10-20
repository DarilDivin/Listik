"use client";

import { useEffect, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { Activite } from "@/features/assistant/activite";

/**
 * L'orbe qui montre ce que fait l'Assistant (bibliothèque `thinking-orbs`,
 * licence MIT). Chaque état réel a son animation :
 *   — réfléchit → des particules en orbite (`working`) ;
 *   — cherche   → un méridien qui balaie le globe (`searching`) ;
 *   — agit      → une forme qui se dessine (`shaping`), ou un ruban qui
 *                 s'écrit quand c'est le journal (`composing`).
 *
 * L'orbe se teinte à la couleur d'accent ; la bibliothèque garde son relief
 * en éclaircissant ou en fonçant la teinte selon le fond. Elle suit d'elle-
 * même le thème (classe `dark`) et s'arrête quand le système demande moins
 * d'animations.
 */
function animation({ etat, outil }: Activite): OrbState {
  if (etat === "cherche") return "searching";
  if (etat === "agit") return outil === "create_journal_entry" ? "composing" : "shaping";
  return "working";
}

/**
 * L'accent en `rgb()`, la seule écriture que la bibliothèque comprend.
 * `--brand` est en oklch : on le résout en le peignant sur un pixel.
 */
function lireAccent(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "rgb(42,139,148)";
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#2a8b94";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

function useAccent(): string | undefined {
  const [accent, setAccent] = useState<string>();
  useEffect(() => {
    const relire = () => setAccent(lireAccent());
    relire();
    // L'accent et le thème vivent sur <html> : on relit à chaque changement.
    const observateur = new MutationObserver(relire);
    observateur.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent", "data-oled"],
    });
    return () => observateur.disconnect();
  }, []);
  return accent;
}

export function OrbeActivite({ activite, taille = 64 }: { activite: Activite; taille?: 64 | 32 | 20 }) {
  const accent = useAccent();
  return (
    <ThinkingOrb
      state={animation(activite)}
      size={taille}
      color={accent}
      aria-label="L’Assistant travaille"
    />
  );
}
