// Logique pure de l'undo (K2) — sans React, SWR ni IPC, testable isolément.
// Extrait de `useTodoMutations.ts` : ce fichier importe `@/lib/swr-config` en
// VALEUR (pas `import type`), que vitest ne sait pas résoudre sans plugin
// d'alias — les fonctions pures vivent donc à part, comme `ordering.ts`.
import type { Todo, UpdateTodoInput } from "./types";

/** Extrait, depuis une tâche, les valeurs correspondant aux clés d'un payload
 *  de mise à jour — sert à construire un payload de RESTAURATION exact. */
export function pickForRestore(
  todo: Todo,
  keys: (keyof UpdateTodoInput)[],
): UpdateTodoInput {
  const restore: Record<string, unknown> = {};
  for (const key of keys) restore[key] = (todo as unknown as Record<string, unknown>)[key];
  return restore as UpdateTodoInput;
}

/**
 * Payload de restauration d'un `toggle()` à partir de l'état D'AVANT bascule.
 *
 * Piège (le seul vrai piège de cette phase) : sur une tâche récurrente,
 * `toggle()` ne marque pas « terminée » — il AVANCE `scheduled_for`/
 * `due_date`/`remind_at` à la prochaine occurrence. Rejouer `toggle()` pour
 * « annuler » avancerait une SECONDE fois, ça ne l'annulerait pas. On restaure
 * donc explicitement les trois champs vers leurs valeurs d'origine.
 */
export function restorePayloadForToggle(before: Todo): UpdateTodoInput {
  if (before.recurrence !== "none" && before.status === "pending") {
    return {
      status: "pending",
      scheduled_for: before.scheduled_for,
      due_date: before.due_date,
      remind_at: before.remind_at,
    };
  }
  return { status: before.status };
}
