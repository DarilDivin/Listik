import type { CreateTodoInput } from "./types";
import type { SmartTaskData } from "./useTaskMode";
import { toLocalISODate } from "../../lib/date";

/**
 * Ce que l'on écrit en base pour une phrase analysée — le SEUL endroit qui
 * le calcule, pour la page principale comme pour la barre rapide (elles
 * avaient divergé : la barre rapide perdait « chaque lundi »).
 *
 * `projectId` est l'id du `#projet` tapé, déjà résolu par l'appelant.
 * `whenUndated` ne s'applique que si aucune date n'a été reconnue ;
 * `container` s'applique toujours ; un `#projet` tapé prime sur le conteneur.
 */
export function payloadDeCapture(
  data: SmartTaskData,
  projectId: string | null,
  options?: {
    /** Défauts de DATE — écartés dès qu'une date est reconnue dans le texte. */
    whenUndated?: Partial<CreateTodoInput>;
    /** Rattachement du conteneur ouvert — appliqué même si une date est saisie
     *  (« appeler Jean demain » dans un projet va dans le projet ET demain). */
    container?: Partial<CreateTodoInput>;
  },
): CreateTodoInput {
  const dueDate = data.dueDate ? toLocalISODate(data.dueDate) : null;
  return {
    text: data.text,
    note: data.note ?? null,
    priority: data.priority ?? "normal",
    // Une date saisie est un « quand je m'y mets » (planification) — jamais
    // une échéance. Celle-ci ne se pose que dans le panneau de détail.
    scheduled_for: dueDate,
    due_date: null,
    // Répétition écrite en clair (« chaque lundi ») : le modèle ne retient
    // pas le jour, c'est `scheduled_for` qui le fixe.
    ...(data.recurrence && data.recurrence !== "none"
      ? {
          recurrence: data.recurrence,
          // Jours nommés : « chaque lundi et jeudi ». Sans eux, la règle
          // hebdomadaire reste ancrée sur `scheduled_for`.
          ...(data.recurWeekdays
            ? { recur_weekdays: data.recurWeekdays }
            : {}),
        }
      : {}),
    ...(dueDate ? {} : options?.whenUndated),
    ...options?.container,
    // Un `#projet` explicitement tapé prime sur le conteneur ouvert (et exclut
    // le rattachement direct à un domaine : les deux ne coexistent pas).
    ...(projectId ? { project_id: projectId, area_id: null } : {}),
  };
}
