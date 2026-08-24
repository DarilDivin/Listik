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
 * Quelques touches, en revanche, ont un symbole compris partout : celles-ci
 * peuvent s'afficher tel quel sur les deux systèmes.
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

/** Assemble un raccourci lisible : « Ctrl N » ou « ⌘N ». Le symbole macOS se
 *  colle à la touche, le mot Windows en est séparé. */
export function useShortcut(key: string): string {
  const cmd = useCommandKey();
  return cmd === "⌘" ? `⌘${key}` : `${cmd} ${key}`;
}
