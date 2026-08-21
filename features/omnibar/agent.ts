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
  const message = await invoke<string>("ai_agent_run", { text, history });
  return { message };
}
