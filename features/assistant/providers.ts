import { invoke } from "@tauri-apps/api/core";

export type ProviderId = "claude" | "codex" | "antigravity" | "opencode";
export type ProviderConnection = "missing" | "auth_required" | "verify" | "ready";

export interface CliProviderStatus {
  id: ProviderId;
  label: string;
  installed: boolean;
  version: string | null;
  connection: ProviderConnection;
  detail: string;
}

export const aiProvidersApi = {
  inspect: () => invoke<CliProviderStatus[]>("inspect_ai_providers"),
  connect: (provider: ProviderId) => invoke("connect_ai_provider", { provider }),
  test: (provider: ProviderId) => invoke<string>("test_ai_provider", { provider }),
};
