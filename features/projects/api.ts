// Couche d'accès aux commandes Tauri des domaines/projets (le SQL vit côté Rust).
import { invoke } from "@tauri-apps/api/core";
import type {
  Area,
  CreateAreaInput,
  CreateProjectInput,
  Project,
  UpdateAreaInput,
  UpdateProjectInput,
} from "./types";

/** Émis par le backend après toute mutation de domaine OU de projet. */
export const PROJECTS_CHANGED = "projects:changed";

export const areasApi = {
  list: () => invoke<Area[]>("list_areas"),
  create: (payload: CreateAreaInput) => invoke<Area>("create_area", { payload }),
  update: (id: string, payload: UpdateAreaInput) =>
    invoke<Area>("update_area", { id, payload }),
  remove: (id: string) => invoke<void>("delete_area", { id }),
};

export const projectsApi = {
  list: () => invoke<Project[]>("list_projects"),
  create: (payload: CreateProjectInput) =>
    invoke<Project>("create_project", { payload }),
  update: (id: string, payload: UpdateProjectInput) =>
    invoke<Project>("update_project", { id, payload }),
  remove: (id: string) => invoke<void>("delete_project", { id }),
};
