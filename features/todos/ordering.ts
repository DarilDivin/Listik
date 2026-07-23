// Ordre manuel & intentions de dépôt — logique pure (sans React ni DOM).
//
// Principe (voir docs/ROADMAP-THINGS.md, phase K1) : « la date choisit la
// SECTION, la position choisit l'ORDRE dans la section ». Glisser dans une
// section écrit `orderings` ; glisser sur le rail est une MUTATION
// (replanifier/affecter) — le regroupement GTD reste pur.
import type { Todo, UpdateTodoInput } from "./types";
import type { PlannerView } from "./grouping";
import type { SectionKey } from "@/components/ui-prefs";

/**
 * Contexte d'ordre manuel d'une section, ou `null` si la section reste en tri
 * automatique. Volontairement restreint : En retard se trie par retard (son
 * travail est de rappeler chronologiquement), Demain/À venir par date.
 */
export function orderingContextOf(section: SectionKey): string | null {
  switch (section) {
    case "today":
    case "inbox":
    case "anytime":
    case "someday":
      return section;
    default:
      return null;
  }
}

/** Contexte d'ordre manuel de la liste d'un projet. */
export const projectOrderingContext = (projectId: string): string =>
  `project:${projectId}`;

/**
 * Applique l'ordre manuel d'un contexte à des tâches déjà triées.
 *
 * Les non-positionnées passent DEVANT, dans leur ordre d'arrivée : une capture
 * fraîche doit apparaître en tête (la récompense de l'Omnibar), pas enterrée
 * sous un bloc positionné. Entre positionnées : la position SEULE — pas de
 * règle « pending d'abord » qui ferait sauter une ligne cochée pendant la
 * pause LINGER. Les positions de tâches disparues sont simplement ignorées
 * (le remplacement complet côté backend les purgera au prochain drag).
 */
export function applyOrdering(
  todos: Todo[],
  positions: ReadonlyMap<string, number> | undefined,
): Todo[] {
  if (!positions || positions.size === 0) return todos;

  const unpositioned = todos.filter((t) => !positions.has(t.id));
  const positioned = todos
    .filter((t) => positions.has(t.id))
    .sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));

  return [...unpositioned, ...positioned];
}

/**
 * Nouvel ordre complet d'une section après avoir déplacé `draggedId` contre
 * `targetId` (au-dessus ou en-dessous). Renvoie les ids dans l'ordre — la
 * charge utile de `set_ordering` (remplacement complet : le premier drag
 * fige l'ordre affiché de TOUTE la section, ce qui élimine l'état mixte
 * positionné/non-positionné).
 */
export function reorderIds(
  ids: string[],
  draggedId: string,
  targetId: string,
  edge: "top" | "bottom",
): string[] {
  if (draggedId === targetId) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const at = without.indexOf(targetId);
  if (at === -1) return ids;
  const insertAt = edge === "top" ? at : at + 1;
  return [...without.slice(0, insertAt), draggedId, ...without.slice(insertAt)];
}

/** Cible de dépôt du rail. */
export type RailDropTarget =
  | { kind: "view"; view: PlannerView }
  | { kind: "project"; id: string };

/**
 * Mutation induite par le dépôt d'une tâche sur une cible du rail — ou `null`
 * si le dépôt est sans effet (état identique) ou interdit (Journal…). Pure et
 * testée : c'est ici que vivent les cas limites, pas dans le câblage DnD.
 */
export function dropIntent(
  target: RailDropTarget,
  todo: Todo,
  today: string,
  tomorrow: string,
): UpdateTodoInput | null {
  if (target.kind === "project") {
    if (todo.project_id === target.id) return null;
    // Rejoindre un projet quitte le rattachement direct à un domaine.
    return { project_id: target.id, area_id: null };
  }

  switch (target.view) {
    case "today":
      if (todo.scheduled_for === today && !todo.someday && !todo.this_evening)
        return null;
      // Déposer sur Aujourd'hui sort de « Ce soir » : la sous-section du soir
      // a sa propre place, y retomber silencieusement surprendrait.
      return { scheduled_for: today, someday: false, this_evening: false };

    case "upcoming":
      if (todo.scheduled_for === tomorrow && !todo.someday) return null;
      return { scheduled_for: tomorrow, someday: false };

    case "someday":
      if (todo.someday) return null;
      return { someday: true };

    case "anytime":
      // « Quand je peux » exige un rattachement : sans projet ni domaine, la
      // tâche retomberait en Boîte de réception — un dépôt qui atterrit
      // ailleurs que sur sa cible est pire qu'un dépôt refusé.
      if (todo.project_id === null && todo.area_id === null) return null;
      if (todo.scheduled_for === null && !todo.someday) return null;
      return { scheduled_for: null, someday: false, this_evening: false };

    case "inbox":
      // Retour à l'inbox = dé-trier entièrement.
      if (
        todo.scheduled_for === null &&
        !todo.someday &&
        todo.project_id === null &&
        todo.area_id === null
      )
        return null;
      return {
        scheduled_for: null,
        someday: false,
        this_evening: false,
        project_id: null,
        area_id: null,
      };

    case "journal":
      // Terminer une tâche est un geste (la coche), pas un dépôt.
      return null;
  }
}
