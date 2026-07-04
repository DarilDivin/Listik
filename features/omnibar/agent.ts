// Appel de l'agent IA (mode Question / section Assistant). Le LLM choisit un
// outil ; Rust exécute les mutations et renvoie le message + les sources.
import { invoke } from "@tauri-apps/api/core";
import type { AiAgentResponse } from "@/features/todos/generated/AiAgentResponse";

export type { AiAgentResponse } from "@/features/todos/generated/AiAgentResponse";
export type { AiSource } from "@/features/todos/generated/AiSource";

export function aiAgent(text: string): Promise<AiAgentResponse> {
  return invoke<AiAgentResponse>("ai_agent", { text });
}
