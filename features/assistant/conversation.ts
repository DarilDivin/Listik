import type { AiChatMessage } from "@/features/omnibar/agent";

/**
 * Un tour de conversation = la question ET sa réponse. On garde ce modèle
 * plutôt que le `message.parts[]` du template shadcn : celui-ci existe pour
 * les appels d'outils et le streaming de l'AI SDK, que notre agent n'a pas
 * (`ai_agent_run` rend une seule chaîne, d'un bloc). Et c'est ce tour qui
 * porte l'unité de plafonnement de l'historique ci-dessous.
 */
export interface Turn {
  id: string;
  question: string;
  answer?: string;
  error?: boolean;
}

// Un LLM est sans état : on lui renvoie les derniers échanges à chaque appel
// pour qu'il résolve les références au contexte ("et demain ?"). Plafonné
// pour ne pas faire grandir indéfiniment le coût/latence de chaque appel.
export const MAX_HISTORY_TURNS = 6;

export function buildHistory(turns: Turn[]): AiChatMessage[] {
  return turns
    .filter((t) => t.answer !== undefined && !t.error)
    .slice(-MAX_HISTORY_TURNS)
    .flatMap((t): AiChatMessage[] => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.answer! },
    ]);
}
