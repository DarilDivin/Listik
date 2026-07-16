// Types de SORTIE générés depuis Rust (src-tauri/src/models/{area,project}.rs)
// via ts-rs → source de vérité unique ; régénérer avec `cargo test` (sans
// `--lib` : le crate est un binaire). Ne pas éditer ./generated.
export type { Area } from "./generated/Area";
export type { Project } from "./generated/Project";
export type { ProjectStatus } from "./generated/ProjectStatus";

import type { ProjectStatus } from "./generated/ProjectStatus";

// Types d'ENTRÉE (construits côté frontend) : écrits à la main.
export interface CreateAreaInput {
  name: string;
}

// `position` n'est volontairement pas exposé ici : le réordonnancement manuel
// est un chantier à part (phase K1). Le backend l'accepte déjà.
export interface UpdateAreaInput {
  name?: string;
}

export interface CreateProjectInput {
  name: string;
  area_id?: string | null;
  note?: string | null;
  /** Deadline « jour seul » du projet (« YYYY-MM-DD »). */
  deadline?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  note?: string | null;
  area_id?: string | null;
  status?: ProjectStatus;
  deadline?: string | null;
}
