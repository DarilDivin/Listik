// Appel de l'agent IA (mode Question / section Assistant) : un CLI installé
// sur la machine (Claude Code, bientôt Gemini/OpenCode) lit et modifie les
// données lui-même via le serveur MCP local — Rust ne fait qu'orchestrer le
// sous-processus, il n'exécute plus rien pour son compte (contrairement à
// l'ancien circuit sidecar).
import { invoke } from "@tauri-apps/api/core";
import type { AiChatMessage } from "@/features/todos/generated/AiChatMessage";

export type { AiChatMessage } from "@/features/todos/generated/AiChatMessage";

export interface AiAgentTurn {
  message: string;
}

// Le CLI est sans état entre deux appels (`--no-session-persistence`) : on
// lui renvoie le fil de la conversation à chaque appel pour qu'il résolve
// les références au contexte ("et demain ?").
export async function aiAgent(
  text: string,
  history: AiChatMessage[] = [],
): Promise<AiAgentTurn> {
  if (reponseFacticeActive()) return reponseFactice(text);
  const message = await invoke<string>("ai_agent_run", { text, history });
  return { message };
}

/**
 * EN DÉVELOPPEMENT SEULEMENT : une réponse factice, pour éprouver la fenêtre
 * rapide et l'Assistant sans lancer le CLI (une douzaine de secondes et un
 * vrai coût à chaque essai). S'allume avec
 * `localStorage.setItem("listik.reponseFactice", "1")`.
 */
function reponseFacticeActive(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return localStorage.getItem("listik.reponseFactice") === "1";
  } catch {
    return false;
  }
}

async function reponseFactice(text: string): Promise<AiAgentTurn> {
  await new Promise((r) => setTimeout(r, 1800));
  return {
    message: [
      `Réponse d’essai à « ${text} ».`,
      "Voici un paragraphe assez long pour occuper plusieurs lignes dans le panneau de la fenêtre rapide, et vérifier que le texte se lit bien à cette largeur.",
      "- un premier point de liste ;\n- un second point, un peu plus long que le premier ;\n- un dernier.",
      "Et une phrase de conclusion.",
    ].join("\n\n"),
  };
}
