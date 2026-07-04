// Correction IA (sidecar) du texte de tâche, appelée à la validation (pas à
// chaque frappe). Best-effort : indisponible (pas de clé API, sidecar down…)
// → on retombe silencieusement sur l'analyse locale (regex/chrono-node).
import { invoke } from "@tauri-apps/api/core";
import type { AiParsedTask } from "./generated/AiParsedTask";

export async function aiParseTask(text: string): Promise<AiParsedTask | null> {
  try {
    return await invoke<AiParsedTask>("ai_parse", { text });
  } catch (error) {
    console.warn("ai_parse indisponible, analyse locale conservée:", error);
    return null;
  }
}
