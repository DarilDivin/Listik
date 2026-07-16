// Type de SORTIE généré depuis Rust (src-tauri/src/models/tag.rs) via ts-rs
// → source de vérité unique ; régénérer avec `cargo test` (sans `--lib` : le
// crate est un binaire). Ne pas éditer ./generated.
export type { Tag } from "./generated/Tag";

// Types d'ENTRÉE (construits côté frontend) : écrits à la main.
export interface CreateTagInput {
  name: string;
  /** Imbrication : colonne présente, sans UI pour l'instant (périmètre lean). */
  parent_id?: string | null;
}

export interface UpdateTagInput {
  name?: string;
}
