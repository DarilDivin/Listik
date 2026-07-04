import { ListTodo, Sparkles, StickyNote, type LucideIcon } from "lucide-react";

/**
 * Registre des commandes de l'Omnibar.
 *
 * L'Omnibar est une barre de saisie unique « à modes » : un préfixe `/xxx`
 * sélectionne un mode, sinon le `defaultMode` de la surface s'applique. Ajouter
 * une commande = ajouter une entrée ici (rien d'autre à câbler côté détection).
 */
export type OmnibarMode = "task" | "note" | "ask";

export interface OmnibarCommand {
  id: string;
  /** Déclencheur principal, ex. `/tache`. */
  trigger: string;
  /** Alias acceptés (ex. `/t`). */
  aliases?: string[];
  mode: OmnibarMode;
  /** Libellé court (badge + menu). */
  label: string;
  /** Description affichée dans le menu slash. */
  description: string;
  /** Placeholder du champ dans ce mode. */
  placeholder: string;
  icon: LucideIcon;
  /** Classes Tailwind du badge (fond teinté + icône colorée). */
  color: string;
  /** `false` = mode visible mais action encore à venir (stub). */
  enabled: boolean;
}

export const OMNIBAR_COMMANDS: OmnibarCommand[] = [
  {
    id: "task",
    trigger: "/tache",
    aliases: ["/t", "/tâche", "/task"],
    mode: "task",
    label: "Tâche",
    description: "Créer une tâche",
    placeholder: "Capturer une tâche…",
    icon: ListTodo,
    color: "bg-sky-500/8 text-sky-600 dark:text-sky-400",
    enabled: true,
  },
  {
    id: "note",
    trigger: "/note",
    aliases: ["/n"],
    mode: "note",
    label: "Note",
    description: "Écrire une note",
    placeholder: "Écrire une note… (Entrée pour enregistrer)",
    icon: StickyNote,
    color: "bg-amber-500/8 text-amber-600 dark:text-amber-400",
    enabled: true,
  },
  {
    id: "ask",
    trigger: "/question",
    aliases: ["/q", "/ask", "/?"],
    mode: "ask",
    label: "Question",
    description: "Poser une question à l'assistant",
    placeholder: "Poser une question… (bientôt — Phase D)",
    icon: Sparkles,
    color: "bg-violet-500/8 text-violet-600 dark:text-violet-400",
    enabled: false,
  },
];

export const commandForMode = (mode: OmnibarMode): OmnibarCommand =>
  OMNIBAR_COMMANDS.find((c) => c.mode === mode) ?? OMNIBAR_COMMANDS[0];

/** Commande dont le trigger (ou un alias) égale exactement `token` (insensible à la casse). */
export const matchTrigger = (token: string): OmnibarCommand | undefined => {
  const t = token.toLowerCase();
  return OMNIBAR_COMMANDS.find(
    (c) => c.trigger.toLowerCase() === t || c.aliases?.some((a) => a.toLowerCase() === t),
  );
};
