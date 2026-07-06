// Export JSON complet (tâches + notes) : le frontend gère le dialogue
// "Enregistrer sous" (natif, interactif), Rust se charge de lire les données
// et d'écrire le fichier à l'emplacement choisi.
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

function defaultFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `listik-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Renvoie le chemin choisi, ou `null` si l'utilisateur a annulé le dialogue. */
export async function exportBackup(): Promise<string | null> {
  const path = await save({
    defaultPath: defaultFileName(),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;

  await invoke("export_backup", { path });
  return path;
}
