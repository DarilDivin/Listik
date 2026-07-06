// Recherche sémantique directe (Ctrl+K), sans passer par l'agent conversationnel.
import { invoke } from "@tauri-apps/api/core";
import type { AiSource } from "@/features/omnibar/agent";

export function aiSearch(query: string, k = 8): Promise<AiSource[]> {
  return invoke<AiSource[]>("ai_search", { query, k });
}
