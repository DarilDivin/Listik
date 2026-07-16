// Types de SORTIE générés depuis Rust (src-tauri/src/models/task.rs) via ts-rs.
// → source de vérité unique ; régénérer avec `cargo test` (ne pas éditer ./generated).
export type { Todo } from "./generated/Todo";
export type { Priority } from "./generated/Priority";
export type { TodoStatus } from "./generated/TodoStatus";
export type { Recurrence } from "./generated/Recurrence";

import type { Priority } from "./generated/Priority";
import type { TodoStatus } from "./generated/TodoStatus";
import type { Recurrence } from "./generated/Recurrence";

// Types d'ENTRÉE (construits côté frontend) : champs optionnels, écrits à la main.
export interface CreateTodoInput {
  text: string;
  note?: string | null;
  list?: string | null;
  priority?: Priority;
  recurrence?: Recurrence;
  scheduled_for?: string | null;
  due_date?: string | null;
  /** Rappel : date-heure locale « YYYY-MM-DDTHH:MM » ou null. */
  remind_at?: string | null;
  /** Projet de rattachement. */
  project_id?: string | null;
  /** Domaine de rattachement direct (sans projet intermédiaire). */
  area_id?: string | null;
  /** En-tête interne de projet (lean, sans UI). */
  heading_id?: string | null;
  /** « Ce soir » : sous-section d'Aujourd'hui. */
  this_evening?: boolean;
  /** « Un jour » (Someday). */
  someday?: boolean;
}

export interface UpdateTodoInput {
  text?: string;
  note?: string | null;
  list?: string | null;
  priority?: Priority;
  recurrence?: Recurrence;
  status?: TodoStatus;
  scheduled_for?: string | null;
  due_date?: string | null;
  /** Rappel : date-heure locale « YYYY-MM-DDTHH:MM » ou null. */
  remind_at?: string | null;
  /** Projet de rattachement. */
  project_id?: string | null;
  /** Domaine de rattachement direct (sans projet intermédiaire). */
  area_id?: string | null;
  /** En-tête interne de projet (lean, sans UI). */
  heading_id?: string | null;
  /** « Ce soir » : sous-section d'Aujourd'hui. */
  this_evening?: boolean;
  /** « Un jour » (Someday). */
  someday?: boolean;
}
