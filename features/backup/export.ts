// Sauvegarde complète : le frontend gère le dialogue « Enregistrer sous »
// (natif, interactif), Rust lit les données, écrit le JSON et copie les
// pièces jointes dans un dossier voisin.
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SauvegardeBilan } from "./generated/SauvegardeBilan";

export type { SauvegardeBilan };

function defaultFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `listik-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Rend le bilan de ce qui a été emporté, ou `null` si le dialogue a été
 * refermé — ce qui n'est pas un échec.
 */
export async function exportBackup(): Promise<SauvegardeBilan | null> {
  const path = await save({
    defaultPath: defaultFileName(),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;

  return await invoke<SauvegardeBilan>("export_backup", { path });
}

/** « 128 tâches, 43 jours de journal, 12 pièces ». */
export function resume(bilan: SauvegardeBilan): string {
  const pluriel = (n: number, un: string, plusieurs = `${un}s`) =>
    `${n} ${n > 1 ? plusieurs : un}`;
  const bouts = [pluriel(bilan.taches, "tâche")];
  // Un journal vide ne se mentionne pas : « 0 jour » n'apprend rien et
  // allonge la phrase.
  if (bilan.jours > 0) bouts.push(`${pluriel(bilan.jours, "jour")} de journal`);
  if (bilan.pieces > 0) bouts.push(pluriel(bilan.pieces, "pièce"));
  return bouts.join(", ");
}

/**
 * Ce qui n'a PAS pu être emporté, quand il y en a.
 *
 * Une pièce dont le fichier a disparu du disque garde sa fiche dans le JSON,
 * mais ses octets sont perdus. Le taire ferait croire la sauvegarde complète.
 */
export function manquants(bilan: SauvegardeBilan): string | null {
  if (bilan.pieces_manquantes === 0) return null;
  const n = bilan.pieces_manquantes;
  return n > 1
    ? `${n} pièces sont introuvables sur le disque — leur fiche est gardée, pas leur contenu.`
    : "Une pièce est introuvable sur le disque — sa fiche est gardée, pas son contenu.";
}
