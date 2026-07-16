import useSWR from "swr";
import { areasApi, projectsApi } from "@/features/projects/api";
import { useProjectsSync } from "@/features/projects/useProjectsSync";
import { useProjectsMutations } from "@/features/projects/useProjectsMutations";
import { todosApi } from "@/features/todos/api";
import { SWR_KEYS } from "@/lib/swr-config";

/**
 * Domaines + projets (structure Things). Même pattern que `usePlannerTodos` :
 * SWR + revalidation par événement backend (`projects:changed`).
 */
export const useProjects = () => {
  useProjectsSync();

  const { data: areas = [], isLoading: areasLoading } = useSWR(
    SWR_KEYS.ALL_AREAS,
    () => areasApi.list(),
    { revalidateOnFocus: true, dedupingInterval: 2000 },
  );

  const { data: projects = [], isLoading: projectsLoading } = useSWR(
    SWR_KEYS.ALL_PROJECTS,
    () => projectsApi.list(),
    { revalidateOnFocus: true, dedupingInterval: 2000 },
  );

  const mutations = useProjectsMutations();

  /**
   * Achève un projet. `completeTasks` termine aussi ses tâches ouvertes —
   * un choix explicite de l'utilisateur (voir la confirmation dans
   * `ProjectView`) : cascader en silence surprendrait, et laisser des tâches
   * vivantes dans un projet achevé les rendrait invisibles.
   */
  const completeProject = async (id: string, completeTasks: boolean) => {
    if (completeTasks) {
      const all = await todosApi.list();
      const open = all.filter(
        (t) => t.project_id === id && t.status === "pending",
      );
      // Séquentiel : chaque `toggle_todo` émet `todos:changed`, et le volume
      // est celui d'un projet personnel — inutile de paralléliser.
      for (const todo of open) await todosApi.toggle(todo.id);
    }
    await mutations.updateProject(id, { status: "completed" });
  };

  return {
    areas,
    projects,
    loading: areasLoading || projectsLoading,
    completeProject,
    ...mutations,
  };
};
