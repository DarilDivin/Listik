"use client";

import { useEffect, useState } from "react";

/**
 * Notation des raccourcis clavier.
 *
 * Le jeu de symboles n'est PAS symétrique entre les plateformes. macOS a une
 * convention établie, qu'Apple emploie dans ses propres menus et que ses
 * utilisateurs lisent d'un coup d'œil : ⌘ ⌥ ⌃ ⇧. Windows n'a pas
 * d'équivalent — Microsoft écrit ses modificateurs en toutes lettres
 * (« Ctrl+N »), et le seul glyphe propre au système est celui de la touche
 * Windows. Afficher « ⌃N » sous Windows, comme on le faisait, ne veut donc
 * rien dire pour personne.
 *
 * Ce fichier a longtemps affirmé que certaines touches avaient « un symbole
 * compris partout ». Le rendu prouve le contraire : dans Geist, `⎋` retombe
 * sur un glyphe de repli qui ressemble à un panneau d'interdiction, `⏎` est
 * illisible en 12 px, et `⇧` se confond avec la flèche ↑ qu'on affiche juste
 * à côté. L'asymétrie vaut donc aussi pour ces touches-là — glyphe sur macOS,
 * où la convention EST le glyphe, mot ailleurs.
 *
 * Les flèches font exception : elles se rendent partout, et aucun mot ne les
 * dirait mieux.
 */
export const KEY_GLYPH = {
  enter: "⏎",
  escape: "⎋",
  tab: "⇥",
  backspace: "⌫",
  shift: "⇧",
  up: "↑",
  down: "↓",
} as const;

/** Les mêmes touches en toutes lettres, pour les plateformes sans convention. */
const KEY_WORD: Record<keyof typeof KEY_GLYPH, string> = {
  enter: "Entrée",
  escape: "Échap",
  tab: "Tab",
  backspace: "Retour",
  shift: "Maj",
  up: "↑",
  down: "↓",
};

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Libellé de la touche de commande : « ⌘ » sur macOS, « Ctrl » ailleurs.
 *
 * Résolu APRÈS le montage, et non au rendu : l'application est exportée en
 * statique, le HTML serait donc figé sur la plateforme qui l'a construit.
 * On part de « Ctrl » — le cas de loin le plus fréquent ici — et on ne bascule
 * que si l'on est vraiment sur un Mac.
 */
export function useCommandKey(): string {
  const [label, setLabel] = useState("Ctrl");
  useEffect(() => {
    if (isApplePlatform()) setLabel("⌘");
  }, []);
  return label;
}

/**
 * Libellé de la touche d'option : « ⌥ » sur macOS, « Alt » ailleurs. Même
 * asymétrie que `useCommandKey`, et même résolution après montage.
 */
export function useAltKey(): string {
  const [label, setLabel] = useState("Alt");
  useEffect(() => {
    if (isApplePlatform()) setLabel("⌥");
  }, []);
  return label;
}

/**
 * Noms des touches à afficher, résolus après montage comme les modificateurs :
 * les glyphes sur macOS, les mots ailleurs.
 */
export function useKeyLabels(): Record<keyof typeof KEY_GLYPH, string> {
  const [labels, setLabels] = useState<Record<keyof typeof KEY_GLYPH, string>>(KEY_WORD);
  useEffect(() => {
    if (isApplePlatform()) setLabels(KEY_GLYPH);
  }, []);
  return labels;
}

/** Assemble un raccourci lisible : « Ctrl N » ou « ⌘N ». Le symbole macOS se
 *  colle à la touche, le mot Windows en est séparé. */
export function useShortcut(key: string): string {
  const cmd = useCommandKey();
  return cmd === "⌘" ? `⌘${key}` : `${cmd} ${key}`;
}
