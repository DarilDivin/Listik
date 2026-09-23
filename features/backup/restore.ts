import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface RestaurationBilan {
  taches: number;
  jours: number;
  pieces: number;
}

/** Ouvre le sélecteur natif sans modifier les données. */
export async function chooseBackup(): Promise<string | null> {
  const selection = await open({
    multiple: false,
    filters: [{ name: "Sauvegarde Listik", extensions: ["json"] }],
  });
  return typeof selection === "string" ? selection : null;
}

/** Remplace les données locales après la confirmation affichée dans Réglages. */
export async function restoreBackup(path: string): Promise<RestaurationBilan> {
  return invoke<RestaurationBilan>("restore_backup", { path });
}
