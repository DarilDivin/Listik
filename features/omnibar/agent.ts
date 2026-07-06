// Appel de l'agent IA (mode Question / section Assistant). Le LLM choisit un
// outil ; Rust exécute les mutations et renvoie le message + les sources.
import { invoke } from "@tauri-apps/api/core";
import type { AiAgentResponse } from "@/features/todos/generated/AiAgentResponse";
import type { AiChatMessage } from "@/features/todos/generated/AiChatMessage";

export type { AiAgentResponse } from "@/features/todos/generated/AiAgentResponse";
export type { AiSource } from "@/features/todos/generated/AiSource";
export type { AiChatMessage } from "@/features/todos/generated/AiChatMessage";

// Le LLM est sans état : on lui renvoie le fil de la conversation à chaque
// appel pour qu'il résolve les références au contexte ("et demain ?").
export function aiAgent(
  text: string,
  history: AiChatMessage[] = [],
): Promise<AiAgentResponse> {
  return invoke<AiAgentResponse>("ai_agent", { text, history });
}
