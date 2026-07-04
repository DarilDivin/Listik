import { useEffect, useState, type KeyboardEvent } from "react";
import {
  matchTrigger,
  OMNIBAR_COMMANDS,
  type OmnibarCommand,
  type OmnibarMode,
} from "./commands";

interface Params {
  value: string;
  setValue: (v: string) => void;
  currentMode: OmnibarMode;
  /** Bascule l'Omnibar vers un autre mode (le parent vide le champ). */
  switchMode: (mode: OmnibarMode) => void;
}

/**
 * Menu de commandes « slash » de l'Omnibar.
 *
 * - ouvre un menu quand le texte commence par `/` (avant tout espace) ;
 * - navigation clavier (mêmes conventions que `useListAutocomplete`) ;
 * - `interceptChange` auto-valide quand on tape `/trigger ` (espace).
 *
 * Validation d'une commande :
 * - même mode → on retire simplement le préfixe ;
 * - autre mode → on bascule de mode (le nouveau mode démarre vide).
 */
export function useSlashCommands({ value, setValue, currentMode, switchMode }: Params) {
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Requête commande : `/xxx` en tout début de texte, sans espace.
  const m = /^\/(\S*)$/.exec(value);
  const query = m ? m[1] : null;
  const lower = (query ?? "").toLowerCase();

  const items: OmnibarCommand[] =
    query === null
      ? []
      : OMNIBAR_COMMANDS.filter(
          (c) =>
            c.trigger.toLowerCase().includes(lower) ||
            c.label.toLowerCase().includes(lower) ||
            (c.aliases?.some((a) => a.toLowerCase().includes(lower)) ?? false),
        );

  const open = query !== null && items.length > 0 && !dismissed;

  useEffect(() => {
    setHighlight(0);
    if (query === null) setDismissed(false);
  }, [query]);

  const commit = (command: OmnibarCommand, remainder = "") => {
    setDismissed(false);
    if (command.mode === currentMode) {
      setValue(remainder);
    } else {
      switchMode(command.mode);
    }
  };

  const accept = (command: OmnibarCommand) => commit(command, "");

  /** Depuis `onChange` : auto-valide `/trigger ` (espace après un trigger exact). */
  const interceptChange = (raw: string): boolean => {
    const sp = /^(\/\S+)\s(.*)$/.exec(raw);
    if (!sp) return false;
    const command = matchTrigger(sp[1]);
    if (!command) return false;
    commit(command, sp[2]);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(items[Math.min(highlight, items.length - 1)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
    }
  };

  const dismiss = () => setDismissed(true);

  return { open, query, items, highlight, setHighlight, accept, onKeyDown, dismiss, interceptChange };
}
