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

/**
 * Mots qui n'appartiennent qu'a l'expression de date : « le », « pour »,
 * « avant »... Sans eux, retirer la date du titre laisse une preposition
 * orpheline — « Faire la vaisselle le 3 juin » donnerait « Faire la vaisselle
 * le ». chrono les inclut parfois dans sa capture (« a 14h », « dans 3
 * jours ») et parfois non (« le 3 juin » -> « 3 juin ») : on complete.
 */
const DATE_LEAD_WORDS = new Set([
  "le", "la", "les", "l", "du", "de", "des", "au", "aux", "a",
  "pour", "avant", "apres", "vers", "en", "d", "jusqu", "depuis",
]);

/** Enlève les diacritiques : « après » et « apres » se valent ici. */
const deaccent = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Etend la capture de date vers la GAUCHE sur les mots qui n'ont de sens
 * qu'avec elle (au plus deux : « avant le 5 septembre »). Rend une nouvelle
 * capture ; l'originale si rien a etendre.
 */
export function expandDateMatchLeft(text: string, match: DateMatch): DateMatch {
  let start = match.index;
  for (let step = 0; step < 2; step++) {
    const before = text.slice(0, start);
    const m = /(\S+)(\s*)$/.exec(before);
    if (!m) break;
    const word = deaccent(m[1].toLowerCase()).replace(/['’]$/, "");
    if (!DATE_LEAD_WORDS.has(word)) break;
    start = m.index;
  }
  if (start === match.index) return match;
  return { index: start, text: text.slice(start, match.index + match.text.length) };
}

/** Ce qui peut suivre la date sans qu'elle cesse de terminer la saisie : rien,
 *  des espaces, au plus une ponctuation finale. */
const TRAILING_NOISE = /^\s*[.!?;:,]?\s*$/;

/**
 * Retire la date du titre (avec ses mots de liaison), MAIS seulement si elle
 * termine la saisie. La date devient alors un attribut — la garder rendrait le
 * titre faux des le lendemain (« Reviser le CV demain »).
 *
 * Une date au MILIEU d'une phrase en fait partie : l'extraire couperait le
 * propos. Constate en usage reel sur « Aimer X de tout mon coeur. Aujourd'hui
 * et demain et tous les autres jours. », qui devenait « Aimer X de tout mon
 * coeur. et demain… ». Dans ce cas on ne touche a rien : la date est quand
 * meme reconnue et posee sur la tache, elle reste simplement ecrite.
 */
export function stripDateFromText(text: string, match: DateMatch | null): string {
  if (!match) return text;
  const full = expandDateMatchLeft(text, match);
  const after = text.slice(full.index + full.text.length);
  if (!TRAILING_NOISE.test(after)) return text;
  return (text.slice(0, full.index) + after)
    .replace(/\s{2,}/g, " ")
    // Retirer la date laisse la ponctuation finale detachee (« la vaisselle . ») :
    // on la recolle. Pas avant « ! » ni « ? », qui prennent une espace en francais.
    .replace(/\s+([.,])/g, "$1")
    .trim();
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

/**
 * Mots-clés de priorité, DANS L'ORDRE de décision : le premier trouvé gagne.
 * « haute » passe avant « basse », et « !! » avant « ! » — sinon on
 * surlignerait le premier point d'exclamation d'une paire.
 */
const PRIORITY_KEYWORDS: { word: string; priority: Priority }[] = [
  { word: "urgent", priority: "high" },
  { word: "important", priority: "high" },
  { word: "!!", priority: "high" },
  { word: "asap", priority: "high" },
  { word: "!", priority: "high" },
  { word: "plus tard", priority: "low" },
  { word: "quand possible", priority: "low" },
];

/**
 * Priorité déduite du texte, AVEC la position du mot qui l'a décidée — c'est
 * elle qui permet de le surligner et de le rendre cliquable, au même titre que
 * la date ou le projet.
 */
export function detectPriorityMatchFromText(
  text: string,
): { priority: Priority; match: DateMatch } | null {
  const lower = text.toLowerCase();
  for (const { word, priority } of PRIORITY_KEYWORDS) {
    const index = lower.indexOf(word);
    if (index !== -1) {
      return {
        priority,
        match: { index, text: text.slice(index, index + word.length) },
      };
    }
  }
  return null;
}

/** Heuristique de priorité à partir de mots-clés. Une seule table de vérité :
 *  celle de `detectPriorityMatchFromText`. */
export function detectPriorityFromText(text: string): Priority {
  return detectPriorityMatchFromText(text)?.priority ?? "normal";
}

/** Sépare le texte principal de la note (délimiteur `//`). */
export function splitNote(task: string): { mainText: string; note?: string } {
  const parts = task.split("//");
  const mainText = parts[0].trim();
  const note = parts.length > 1 ? parts.slice(1).join("//").trim() : undefined;
  return { mainText, note: note || undefined };
}
