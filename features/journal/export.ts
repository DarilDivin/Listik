// Sortir le journal : un fichier Markdown, et ses photos dans un dossier
// voisin. Le dialogue « Enregistrer sous » est natif et interactif — il vit
// donc côté frontend, Rust ne fait qu'écrire à l'emplacement choisi. Même
// partage des rôles que `features/backup/export.ts`.
import { save } from "@tauri-apps/plugin-dialog";
import { journalApi } from "./api";
import type { JournalExport } from "./types";

function nomParDefaut(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `journal-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.md`;
}

/**
 * Écrit tout le journal à l'emplacement choisi. `null` si l'utilisateur a
 * refermé le dialogue — une annulation n'est pas un échec.
 */
export async function exporterJournal(): Promise<JournalExport | null> {
  const chemin = await save({
    defaultPath: nomParDefaut(),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!chemin) return null;
  return journalApi.exporter(chemin);
}

/**
 * « 12 jours, 3 photos » — ce qui est réellement sorti.
 *
 * « Exporté » tout court ne prouve rien : c'est le compte qui dit si le
 * fichier contient bien ce qu'on croit y avoir mis.
 */
export function resume({ jours, pieces }: JournalExport): string {
  const j = `${jours} jour${jours > 1 ? "s" : ""}`;
  if (pieces === 0) return j;
  return `${j}, ${pieces} photo${pieces > 1 ? "s" : ""}`;
}
