/**
 * L'accueil du premier lancement (components/onboarding/Onboarding.tsx).
 *
 * Il n'apparaît que sur une installation neuve : aucun accueil déjà vu ET une
 * base vide. Quelqu'un qui met à jour depuis une version sans accueil a déjà
 * ses tâches ; on marque alors l'accueil comme vu sans le montrer.
 */

export const ONBOARDING_KEY = "listik.onboarding";
export const ONBOARDING_DONE = "1";

/** Relance l'accueil depuis les Réglages (« Revoir l'accueil »). */
export const REPLAY_ONBOARDING_EVENT = "listik:onboarding-replay";

export interface ExistingData {
  todos: number;
  projects: number;
  areas: number;
  /** Jours du mois courant qui ont au moins un bloc de journal. */
  journalDays: number;
}

export type OnboardingDecision = "show" | "mark-done" | "none";

export function decideOnboarding(stored: string | null, data: ExistingData): OnboardingDecision {
  if (stored) return "none";
  const empty = data.todos + data.projects + data.areas + data.journalDays === 0;
  return empty ? "show" : "mark-done";
}

export type Destination =
  | { view: "today"; label: string }
  | { view: "upcoming"; label: string }
  | { view: "inbox"; label: string };

/**
 * Où la première tâche capturée a atterri, en mots. La fenêtre rapide date
 * toujours une tâche (aujourd'hui par défaut) : la Boîte de réception ne sert
 * qu'au repli, pour une tâche sans date.
 */
export function destinationOf(scheduledFor: string | null, todayISO: string): Destination {
  if (!scheduledFor) return { view: "inbox", label: "Boîte de réception" };
  if (scheduledFor <= todayISO) return { view: "today", label: "Aujourd’hui" };
  const [y, m, d] = scheduledFor.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return { view: "upcoming", label: `À venir · ${day}` };
}

/** Les identifiants apparus depuis l'instantané pris à l'ouverture de l'étape. */
export function newIds(before: ReadonlySet<string>, now: readonly { id: string }[]): string[] {
  return now.filter((t) => !before.has(t.id)).map((t) => t.id);
}
