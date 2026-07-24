// Miroir TypeScript de la logique Rust (RecurrenceRule::advance) pour les
// mises à jour optimistes. La source de vérité reste le backend ; on duplique
// le calcul de la prochaine occurrence pour afficher le report sans attendre
// l'IPC.
//
// ⚠️ Table de parité avec les tests de src-tauri/src/models/task.rs : les
// mêmes cas doivent passer des deux côtés.
//
// Arithmétique en (année, mois, jour) PURS — jamais de `new Date("YYYY-MM-DD")`
// (parsé en UTC : minuit UTC = la veille en fuseau négatif) ni de
// `setMonth(+n)` (31 janv + 1 mois « déborde » au 3 mars là où chrono borne
// au 28 févr : l'optimiste afficherait une date que le backend corrigerait).
import type { Recurrence, Todo } from "./types";
import type { RecurMode } from "./generated/RecurMode";
import type { RecurWeekday } from "./generated/RecurWeekday";

export interface RecurrenceRule {
  recurrence: Recurrence;
  /** Toutes les N occurrences. Ignoré pour `weekdays`. */
  interval: number;
  /** Avec `setpos` : le Ne jour de semaine du mois (monthly uniquement). */
  weekday: RecurWeekday | null;
  /** 1..4, -1 = dernier ; -1 sans weekday = dernier jour du mois. */
  setpos: number | null;
}

interface Ymd {
  y: number;
  m: number; // 1..12
  d: number;
}

const parseYmd = (iso: string): Ymd => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

const formatYmd = ({ y, m, d }: Ymd): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

/** 0 = lundi … 6 = dimanche (numérotation chrono, PAS `getDay()` où 0 = dimanche). */
const weekdayOf = ({ y, m, d }: Ymd): number => (new Date(y, m - 1, d).getDay() + 6) % 7;

const WEEKDAY_INDEX: Record<RecurWeekday, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const addDays = (date: Ymd, days: number): Ymd => {
  // Passage par l'epoch UTC : sûr car on ne manipule que des jours entiers.
  const t = Date.UTC(date.y, date.m - 1, date.d) + days * 86_400_000;
  const back = new Date(t);
  return { y: back.getUTCFullYear(), m: back.getUTCMonth() + 1, d: back.getUTCDate() };
};

/** + N mois, jour borné à la fin du mois cible (comportement chrono). */
const addMonthsClamped = (date: Ymd, months: number): Ymd => {
  const total = date.y * 12 + (date.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) };
};

const compareYmd = (a: Ymd, b: Ymd): number =>
  a.y - b.y || a.m - b.m || a.d - b.d;

/** Jour d'epoch (UTC) — seulement pour comparer un ÉCART en jours entre deux
 *  (y,m,d), jamais pour dériver une date affichée (voir les pièges ci-dessus). */
const epochDay = ({ y, m, d }: Ymd): number => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

/** Occurrence positionnelle dans le mois de `anchor` (Ne/dernier jour de semaine,
 *  ou dernier jour du mois). Miroir de `positional_in_month` côté Rust. */
function positionalInMonth(
  anchor: Ymd,
  weekday: RecurWeekday | null,
  pos: number,
): Ymd | null {
  const last: Ymd = { y: anchor.y, m: anchor.m, d: daysInMonth(anchor.y, anchor.m) };

  if (weekday === null) {
    return pos === -1 ? last : null;
  }

  const target = WEEKDAY_INDEX[weekday];
  if (pos === -1) {
    // « Dernier » ≠ « 4e » : un mois compte 4 ou 5 fois chaque jour —
    // on remonte depuis la FIN du mois.
    let d = last;
    while (weekdayOf(d) !== target) d = addDays(d, -1);
    return d;
  }
  if (pos < 1 || pos > 4) return null;
  let d: Ymd = { y: anchor.y, m: anchor.m, d: 1 };
  while (weekdayOf(d) !== target) d = addDays(d, 1);
  d = addDays(d, 7 * (pos - 1));
  return d.m === anchor.m ? d : null;
}

/**
 * Prochaine occurrence STRICTEMENT après `from` (sémantique strict-après :
 * une tâche « 1er lundi » cochée le 1er lundi doit sauter au mois suivant,
 * pas se renvoyer elle-même).
 */
function advanceRule(from: Ymd, rule: RecurrenceRule): Ymd | null {
  const interval = Math.max(1, rule.interval);

  switch (rule.recurrence) {
    case "none":
      return null;
    case "daily":
      return addDays(from, interval);
    case "weekly":
      return addDays(from, 7 * interval);
    case "weekdays": {
      // Intervalle volontairement ignoré : « chaque jour ouvré ».
      let d = addDays(from, 1);
      while (weekdayOf(d) >= 5) d = addDays(d, 1);
      return d;
    }
    case "monthly": {
      if (rule.setpos !== null) {
        // Strict-après : l'occurrence du mois courant si encore à venir
        // (base désalignée), sinon celle du mois + intervalle.
        const cand = positionalInMonth(from, rule.weekday, rule.setpos);
        if (cand && compareYmd(cand, from) > 0) return cand;
        const target = addMonthsClamped(from, interval);
        return positionalInMonth(target, rule.weekday, rule.setpos);
      }
      return addMonthsClamped(from, interval);
    }
  }
}

/** Extrait la règle d'une tâche (mêmes champs que côté Rust). */
export interface RecurrenceFields {
  recurrence: Recurrence;
  recur_interval: number;
  recur_weekday: RecurWeekday | null;
  recur_setpos: number | null;
  recur_mode: RecurMode;
}

export function ruleOf(todo: RecurrenceFields): RecurrenceRule {
  return {
    recurrence: todo.recurrence,
    interval: todo.recur_interval,
    weekday: todo.recur_weekday,
    setpos: todo.recur_setpos,
  };
}

/**
 * Prochaine occurrence (YYYY-MM-DD) pour une tâche récurrente que l'on coche.
 * Base : la date planifiée (mode fixe) ou AUJOURD'HUI (« après complétion »).
 * `none` → renvoie `scheduledFor` inchangé.
 */
export function nextOccurrence(
  scheduledFor: string | null,
  todo: RecurrenceFields,
): string | null {
  if (todo.recurrence === "none") return scheduledFor;

  const now = new Date();
  const today: Ymd = {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  };
  const base =
    todo.recur_mode === "after_completion" || !scheduledFor
      ? today
      : parseYmd(scheduledFor);

  const next = advanceRule(base, ruleOf(todo));
  return next ? formatYmd(next) : scheduledFor;
}

/**
 * Projette les PROCHAINES occurrences d'une tâche récurrente au-delà de
 * `seed` (sa date planifiée réelle) — pour un affichage en lecture seule,
 * jamais matérialisé. Compose `advanceRule` uniquement (aucune arithmétique
 * dupliquée) pour rester fidèle à la parité Rust/JS.
 *
 * Exclut volontairement le mode `after_completion` : sa prochaine occurrence
 * dépend d'une date de complétion future inconnue (voir `nextOccurrence` ci-
 * dessus, `base = today` dans ce mode) — la projeter inventerait une date
 * que le backend ne produira jamais.
 */
export function projectFutureOccurrences(
  seed: string,
  todo: RecurrenceFields,
  { horizonDays = 90, maxCount = 10 }: { horizonDays?: number; maxCount?: number } = {},
): string[] {
  if (todo.recurrence === "none" || todo.recur_mode === "after_completion") return [];

  const rule = ruleOf(todo);
  const seedYmd = parseYmd(seed);
  const limit = epochDay(seedYmd) + horizonDays;
  const dates: string[] = [];
  let current = seedYmd;

  for (let i = 0; i < maxCount; i++) {
    const next = advanceRule(current, rule);
    if (!next || epochDay(next) > limit) break;
    dates.push(formatYmd(next));
    current = next;
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Jamais",
  daily: "Tous les jours",
  weekdays: "Jours ouvrés",
  weekly: "Toutes les semaines",
  monthly: "Tous les mois",
};

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = (
  ["none", "daily", "weekdays", "weekly", "monthly"] as Recurrence[]
).map((value) => ({ value, label: RECURRENCE_LABELS[value] }));

const WEEKDAY_LABELS: Record<RecurWeekday, string> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
};

const ORDINALS: Record<number, string> = { 1: "1er", 2: "2e", 3: "3e", 4: "4e" };

/** Libellé complet d'une règle : « Toutes les 2 semaines », « Le 1er lundi du
 *  mois », « 3 semaines après complétion »… */
export function recurrenceLabel(todo: RecurrenceFields): string {
  const { recurrence } = todo;
  if (recurrence === "none") return "Jamais";
  if (recurrence === "weekdays") return "Jours ouvrés";

  const interval = Math.max(1, Number(todo.recur_interval));
  const setpos = todo.recur_setpos === null ? null : Number(todo.recur_setpos);

  if (recurrence === "monthly" && setpos !== null) {
    if (todo.recur_weekday === null) return "Le dernier jour du mois";
    const day = WEEKDAY_LABELS[todo.recur_weekday];
    return setpos === -1
      ? `Le dernier ${day} du mois`
      : `Le ${ORDINALS[setpos] ?? setpos} ${day} du mois`;
  }

  const unit =
    recurrence === "daily" ? "jour" : recurrence === "weekly" ? "semaine" : "mois";
  const plural = interval > 1 && unit !== "mois" ? `${unit}s` : unit;

  if (todo.recur_mode === "after_completion") {
    return `${interval} ${plural} après complétion`;
  }

  if (interval === 1) return RECURRENCE_LABELS[recurrence];
  return unit === "semaine"
    ? `Toutes les ${interval} semaines`
    : `Tous les ${interval} ${plural}`;
}

// ---------------------------------------------------------------------------
// Projection « fantôme » (vue À venir, style zoom — phase M)
// ---------------------------------------------------------------------------

/** Occurrence future projetée : jamais une ligne réelle (pas d'id en base). */
export interface GhostOccurrence {
  /** Stable pour AnimatePresence, mais ne collisionne jamais avec un id réel. */
  key: string;
  date: string;
  text: string;
  recurrenceLabel: string;
}

/**
 * Construit les fantômes de TOUTES les tâches récurrentes à date fixe — à
 * partir de l'ensemble COMPLET des tâches, pas seulement de celles déjà
 * présentes dans la vue À venir : une tâche dont la ligne réelle tombe
 * AUJOURD'HUI (donc visible dans la section Aujourd'hui, pas Upcoming) doit
 * quand même projeter ses prochaines occurrences dans les jours suivants.
 *
 * `[minDay, maxDay]` borne l'affichage (par défaut J+1 → l'horizon de calcul
 * lui-même) : une récurrence hebdomadaire doit apparaître à J+7, J+14, J+21…
 * pas seulement dans la semaine courante — le style zoom regroupe les jours
 * lointains en semaines/mois, mais les fantômes y voyagent avec les tâches
 * réelles plutôt que de disparaître après J+7.
 */
export function buildGhostOccurrences(
  todos: Todo[],
  opts: { horizonDays?: number; maxCount?: number; minDay?: number; maxDay?: number } = {},
): GhostOccurrence[] {
  const { horizonDays = 90, maxCount = 10, minDay = 1, maxDay = horizonDays } = opts;

  const now = new Date();
  const todayEpoch = epochDay({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

  const ghosts: GhostOccurrence[] = [];
  for (const todo of todos) {
    if (
      todo.status !== "pending" ||
      todo.someday ||
      !todo.scheduled_for ||
      todo.recurrence === "none" ||
      todo.recur_mode === "after_completion"
    ) {
      continue;
    }

    const dates = projectFutureOccurrences(todo.scheduled_for, todo, { horizonDays, maxCount });
    const label = recurrenceLabel(todo);
    for (const date of dates) {
      const dist = epochDay(parseYmd(date)) - todayEpoch;
      if (dist < minDay || dist > maxDay) continue;
      ghosts.push({ key: `ghost-${todo.id}-${date}`, date, text: todo.text, recurrenceLabel: label });
    }
  }
  return ghosts.sort((a, b) => a.date.localeCompare(b.date));
}
