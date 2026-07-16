// Logique pure d'analyse du langage naturel pour SmartTaskInput.
// Sans React → réutilisable et testable isolément.
import * as chrono from "chrono-node";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { Priority } from "./types";

export interface DateMatch {
  index: number;
  text: string;
}

// Tag de liste/projet : `#nom` (lettres, chiffres, tiret, underscore).
const LIST_REGEX = /#([\p{L}\p{N}_-]+)/u;

/** Détecte une liste écrite `#nom` (avant la note `//`). */
export function detectListFromText(task: string): { list: string; match: DateMatch } | null {
  const beforeNote = task.split("//")[0];
  const m = LIST_REGEX.exec(beforeNote);
  if (!m) return null;
  return { list: m[1], match: { index: m.index, text: m[0] } };
}

/** Retire le tag `#nom` du texte (et normalise les espaces). */
export function stripListFromText(task: string): string {
  return task.replace(LIST_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

// Tags : `@nom`, plusieurs par saisie.
//
// Le `(?:^|\s)` en tête n'est PAS cosmétique : sans lui, « envoyer un mail à
// jean@example.com » créerait un tag « example ». Contrairement à `#`, le `@`
// apparaît couramment au milieu d'un mot. Drapeau `g` : `#` désigne un projet
// (un seul), les tags sont multiples par nature.
const TAG_REGEX = /(?:^|\s)@([\p{L}\p{N}_-]+)/gu;

/**
 * Détecte les tags `@nom` (avant la note `//`) avec leur position — pour le
 * surlignage. Dédoublonnés à la casse près : la 1re graphie l'emporte.
 */
export function detectTagMatchesFromText(
  task: string,
): { name: string; match: DateMatch }[] {
  const beforeNote = task.split("//")[0];
  const seen = new Map<string, { name: string; match: DateMatch }>();
  for (const m of beforeNote.matchAll(TAG_REGEX)) {
    const name = m[1];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    // `m[0]` peut inclure l'espace de tête (`(?:^|\s)`) : on recale l'index sur
    // le `@` lui-même, sinon le surlignage déborderait sur le mot précédent.
    const text = `@${name}`;
    seen.set(key, {
      name,
      match: { index: m.index + (m[0].length - text.length), text },
    });
  }
  return [...seen.values()];
}

/** Détecte les tags écrits `@nom` (avant la note `//`), dédoublonnés (NOCASE). */
export function detectTagsFromText(task: string): string[] {
  return detectTagMatchesFromText(task).map((t) => t.name);
}

/** Retire les tags `@nom` du texte (et normalise les espaces). */
export function stripTagsFromText(task: string): string {
  return task
    .replace(TAG_REGEX, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Détecte une date dans le texte (français, dates futures privilégiées). */
export function parseTaskDate(task: string): { date: Date; match: DateMatch } | null {
  const results = chrono.fr.parse(task, new Date(), { forwardDate: true });
  if (results.length === 0) return null;

  const { index, text, start } = results[0];
  return { date: start.date(), match: { index, text } };
}

/** Formate une date en texte naturel français (aujourd'hui / demain / EEEE d MMMM). */
export function formatDateToNaturalText(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return "aujourd'hui";
  if (target.getTime() === tomorrow.getTime()) return "demain";
  return format(date, "EEEE d MMMM", { locale: fr });
}

/** Remplace / insère / retire la date écrite dans le texte de la tâche. */
export function replaceDateInText(
  currentTask: string,
  newDate: Date | null,
  currentMatch: DateMatch | null,
): string {
  if (!newDate) {
    if (currentMatch) {
      return (
        currentTask.slice(0, currentMatch.index) +
        currentTask.slice(currentMatch.index + currentMatch.text.length)
      );
    }
    return currentTask;
  }

  const dateText = formatDateToNaturalText(newDate);

  if (currentMatch) {
    return (
      currentTask.slice(0, currentMatch.index) +
      dateText +
      currentTask.slice(currentMatch.index + currentMatch.text.length)
    );
  }

  const trimmed = currentTask.trim();
  return trimmed + (trimmed ? " " : "") + dateText;
}

/** Heuristique de priorité à partir de mots-clés. */
export function detectPriorityFromText(text: string): Priority {
  const lower = text.toLowerCase();

  if (lower.includes("urgent") || lower.includes("important") || lower.includes("!!")) {
    return "high";
  }
  if (lower.includes("!") || lower.includes("asap")) {
    return "high";
  }
  if (lower.includes("plus tard") || lower.includes("quand possible")) {
    return "low";
  }
  return "normal";
}

/** Sépare le texte principal de la note (délimiteur `//`). */
export function splitNote(task: string): { mainText: string; note?: string } {
  const parts = task.split("//");
  const mainText = parts[0].trim();
  const note = parts.length > 1 ? parts.slice(1).join("//").trim() : undefined;
  return { mainText, note: note || undefined };
}
