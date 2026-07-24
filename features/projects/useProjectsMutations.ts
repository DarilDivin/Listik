import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { areasApi, projectsApi } from "./api";
import type {
  Area,
  CreateAreaInput,
  CreateProjectInput,
  Project,
  UpdateAreaInput,
  UpdateProjectInput,
} from "./types";
import { SWR_KEYS } from "@/lib/swr-config";

/**
 * Mutations domaines/projets avec mise à jour optimiste. Le backend émet
 * `projects:changed` après écriture → `useProjectsSync` revalide ; on ne
 * revalide ici qu'en cas d'erreur (rollback), comme pour les tâches/notes.
 *
 * Pas d'undo par toast sur les suppressions : supprimer un projet DÉTACHE ses
 * tâches (elles ne sont jamais perdues), et le geste est protégé en amont par
 * un AlertDialog. L'undo général est un chantier à part (phase K2).
 */
export function useProjectsMutations() {
  const { mutate } = useSWRConfig();

  const patchAreas = (updater: (areas: Area[]) => Area[]) =>
    mutate<Area[]>(SWR_KEYS.ALL_AREAS, (current = []) => updater(current), false);

  const patchProjects = (updater: (projects: Project[]) => Project[]) =>
    mutate<Project[]>(
      SWR_KEYS.ALL_PROJECTS,
      (current = []) => updater(current),
      false,
    );

  const revalidate = () =>
    mutate((key) => typeof key === "string" && key.startsWith("projects"));
  // Détacher des tâches change aussi les vues de tâches.
  const revalidateTodos = () =>
    mutate((key) => typeof key === "string" && key.startsWith("todos"));

  const createArea = async (payload: CreateAreaInput): Promise<Area> => {
    try {
      return await areasApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création du domaine");
      await revalidate();
      throw error;
    }
  };

  const updateArea = async (id: string, payload: UpdateAreaInput) => {
    patchAreas((areas) =>
      areas.map((a) => (a.id === id ? { ...a, ...payload } : a)),
    );
    try {
      await areasApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors de la modification du domaine");
      await revalidate();
      throw error;
    }
  };

  const deleteArea = async (id: string) => {
    patchAreas((areas) => areas.filter((a) => a.id !== id));
    // Ses projets sont détachés, pas supprimés.
    patchProjects((projects) =>
      projects.map((p) => (p.area_id === id ? { ...p, area_id: null } : p)),
    );
    try {
      await areasApi.remove(id);
      toast.success("Domaine supprimé");
      await revalidateTodos();
    } catch (error) {
      toast.error("Erreur lors de la suppression du domaine");
      await revalidate();
      throw error;
    }
  };

  const createProject = async (payload: CreateProjectInput): Promise<Project> => {
    try {
      return await projectsApi.create(payload);
    } catch (error) {
      toast.error("Erreur lors de la création du projet");
      await revalidate();
      throw error;
    }
  };

  const updateProject = async (id: string, payload: UpdateProjectInput) => {
    patchProjects((projects) =>
      projects.map((p) =>
        p.id === id
          ? { ...p, ...payload, updated_at: new Date().toISOString() }
          : p,
      ),
    );
    try {
      await projectsApi.update(id, payload);
    } catch (error) {
      toast.error("Erreur lors de la modification du projet");
      await revalidate();
      throw error;
    }
  };

  const deleteProject = async (id: string) => {
    patchProjects((projects) => projects.filter((p) => p.id !== id));
    try {
      await projectsApi.remove(id);
      toast.success("Projet supprimé");
      // Ses tâches sont détachées, pas supprimées → elles réapparaissent ailleurs.
      await revalidateTodos();
    } catch (error) {
      toast.error("Erreur lors de la suppression du projet");
      await revalidate();
      throw error;
    }
  };

  /**
   * Duplique un projet AVEC toutes ses tâches (Phase L) : un projet achevé
   * est le candidat n°1 à devenir un gabarit. Pas d'undo dédié : supprimer la
   * copie EST l'undo.
   */
  const duplicateProject = async (id: string): Promise<Project> => {
    try {
      const copy = await projectsApi.duplicate(id);
      toast.success("Projet dupliqué");
      return copy;
    } catch (error) {
      toast.error("Erreur lors de la duplication du projet");
      await revalidate();
      throw error;
    }
  };

  return {
    createArea,
    updateArea,
    deleteArea,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
  };
}
