// Accès aux réglages applicatifs via les commandes Tauri (stockés côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./generated/Settings";

export type { Settings } from "./generated/Settings";

/** Mise à jour partielle des réglages. */
export type SettingsInput = Partial<Settings>;

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  update: (payload: SettingsInput) =>
    invoke<Settings>("update_settings", { payload }),
};
