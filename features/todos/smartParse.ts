// Logique pure d'analyse du langage naturel pour SmartTaskInput.
// Sans React → réutilisable et testable isolément.
import * as chrono from "chrono-node";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { Priority } from "./types";
import type { Recurrence } from "./generated/Recurrence";
import type { RecurWeekday } from "./generated/RecurWeekday";

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

/**
 * Mots qui annoncent une REPETITION (« chaque lundi », « tous les mardis »).
 *
 * La recurrence n'est pas encore reconnue a la saisie : « chaque lundi » ne
 * pose qu'une date, au prochain lundi. Retirer cette date du titre effacerait
 * la seule trace de l'intention — « Sortir les poubelles chaque lundi »
 * devenait « Sortir les poubelles chaque », puis « Sortir les poubelles » si
 * l'on emportait aussi le mot de liaison. On prefere ne rien retirer : le
 * titre garde ce que l'utilisateur a ecrit, et il voit que la repetition n'a
 * pas ete comprise.
 */
const RECURRENCE_HINTS = new Set(["chaque", "tous", "toutes"]);

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
  // Une date annoncee par « chaque »/« tous » exprime une repetition, que
  // l'application ne sait pas encore poser : on laisse le texte intact plutot
  // que d'effacer l'intention.
  const lead = /(\S+)\s*$/.exec(text.slice(0, full.index));
  if (lead && RECURRENCE_HINTS.has(deaccent(lead[1].toLowerCase()))) return text;
  const after = text.slice(full.index + full.text.length);
  if (!TRAILING_NOISE.test(after)) return text;
  return (text.slice(0, full.index) + after)
    .replace(/\s{2,}/g, " ")
    // Retirer la date laisse la ponctuation finale detachee (« la vaisselle . ») :
    // on la recolle. Pas avant « ! » ni « ? », qui prennent une espace en francais.
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

/**
 * Repetitions ecrites en clair, DANS L'ORDRE : la premiere reconnue gagne.
 *
 * L'ordre n'est pas cosmetique — « chaque jour ouvre » doit passer AVANT
 * « chaque jour », sans quoi on ne verrait que le quotidien et « ouvre »
 * resterait orphelin dans le titre.
 *
 * Le modele ne retient PAS le jour choisi : « chaque lundi » vaut
 * « hebdomadaire », et c'est la date de la tache (le prochain lundi, posee par
 * chrono) qui fixe le jour de retour. « chaque lundi et jeudi » est donc hors
 * de portee sans changer le schema.
 */
const RECURRENCE_PATTERNS: { pattern: RegExp; recurrence: Recurrence }[] = [
  // Borne finale en `(?!\p{L})` et non `\b` : en JavaScript, `\b` ne fait pas
  // frontiere apres une lettre accentuee — « ouvré » en fin de chaine n'etait
  // donc jamais reconnu, et l'expression retombait sur « quotidien ».
  {
    pattern: /\b(?:chaque|tous les|toutes les)\s+jours?\s+ouvr[eé]e?s?(?!\p{L})/iu,
    recurrence: "weekdays",
  },
  { pattern: /\ben\s+semaine\b/i, recurrence: "weekdays" },
  { pattern: /\b(?:chaque|tous les|toutes les)\s+jours?\b/i, recurrence: "daily" },
  { pattern: /\bquotidiennes?\b|\bquotidiens?\b/i, recurrence: "daily" },
  { pattern: /\b(?:chaque|tous les|toutes les)\s+semaines?\b/i, recurrence: "weekly" },
  // Plusieurs jours (« chaque lundi et jeudi ») : teste AVANT le jour seul,
  // sinon on ne capturerait que « chaque lundi » et « et jeudi » resterait
  // dans le titre.
  {
    pattern: /\b(?:chaque|tous les|toutes les)\s+(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)(?:\s*(?:,|et)\s*(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?))+/i,
    recurrence: "weekly",
  },
  { pattern: /\b(?:chaque|tous les|toutes les)\s+(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)\b/i, recurrence: "weekly" },
  { pattern: /\bhebdomadaires?\b/i, recurrence: "weekly" },
  { pattern: /\b(?:chaque|tous les|toutes les)\s+mois\b/i, recurrence: "monthly" },
  { pattern: /\bmensuels?\b|\bmensuelles?\b/i, recurrence: "monthly" },
];

/**
 * Repetition demandee dans le texte, AVEC sa position — de quoi la surligner,
 * la rendre cliquable et la retirer du titre, comme la date ou le projet.
 */
const WEEKDAY_CODES: { pattern: RegExp; code: RecurWeekday }[] = [
  { pattern: /\blundis?\b/i, code: "mon" },
  { pattern: /\bmardis?\b/i, code: "tue" },
  { pattern: /\bmercredis?\b/i, code: "wed" },
  { pattern: /\bjeudis?\b/i, code: "thu" },
  { pattern: /\bvendredis?\b/i, code: "fri" },
  { pattern: /\bsamedis?\b/i, code: "sat" },
  { pattern: /\bdimanches?\b/i, code: "sun" },
];

/** Jours nommés dans un fragment (« chaque lundi et jeudi » → mon, thu). */
function weekdaysIn(fragment: string): RecurWeekday[] {
  return WEEKDAY_CODES.filter(({ pattern }) => pattern.test(fragment)).map(
    ({ code }) => code,
  );
}

export function detectRecurrenceMatchFromText(text: string): {
  recurrence: Recurrence;
  match: DateMatch;
  /** Jours nommés, s'il y en a — « mon,thu ». Vide sinon. */
  weekdays: RecurWeekday[];
} | null {
  const head = text.split("//")[0];
  for (const { pattern, recurrence } of RECURRENCE_PATTERNS) {
    const found = pattern.exec(head);
    if (found) {
      return {
        recurrence,
        match: { index: found.index, text: found[0] },
        weekdays: recurrence === "weekly" ? weekdaysIn(found[0]) : [],
      };
    }
  }
  return null;
}

/** Retire la repetition du titre : c'est un attribut, pas un mot de la tache. */
export function stripRecurrenceFromText(
  text: string,
  match: DateMatch | null,
): string {
  if (!match) return text;
  return (text.slice(0, match.index) + text.slice(match.index + match.text.length))
    .replace(/\s{2,}/g, " ")
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
 *
 * Ce sont des EXPRESSIONS, pas des sous-chaînes. Chercher « important » dans
 * « très importante » ne capturait que les neuf premières lettres : le « e » de
 * l'accord restait dehors, et le remplacer donnait « très plus tarde ». Les
 * bornes de mot et les suffixes d'accord règlent les deux : le jeton
 * couvre le mot entier, et « importateur » cesse d'être pris pour « important ».
 * La ponctuation, elle, n'a pas de borne de mot : elle se cherche telle quelle.
 */
const PRIORITY_KEYWORDS: { pattern: RegExp; priority: Priority }[] = [
  { pattern: /\burgent(?:e|s|es)?\b/i, priority: "high" },
  { pattern: /\bimportant(?:e|s|es)?\b/i, priority: "high" },
  { pattern: /!!/, priority: "high" },
  { pattern: /\basap\b/i, priority: "high" },
  { pattern: /!/, priority: "high" },
  { pattern: /\bplus\s+tard\b/i, priority: "low" },
  { pattern: /\bquand\s+possible\b/i, priority: "low" },
];

/**
 * Priorité déduite du texte, AVEC la position du mot qui l'a décidée — c'est
 * elle qui permet de le surligner et de le rendre cliquable, au même titre que
 * la date ou le projet.
 */
export function detectPriorityMatchFromText(
  text: string,
): { priority: Priority; match: DateMatch } | null {
  for (const { pattern, priority } of PRIORITY_KEYWORDS) {
    const found = pattern.exec(text);
    if (found) return { priority, match: { index: found.index, text: found[0] } };
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
