import useSWR from "swr";
import { useMemo } from "react";
import { toast } from "sonner";
import { todosApi } from "@/features/todos/api";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { sortTodos } from "@/features/todos/sort";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import type { CreateTodoInput, Priority, TodoStatus } from "@/features/todos/types";
import type { SmartTaskData } from "@/features/todos/useTaskMode";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";

export const usePlannerTodos = () => {
  useTodosSync();
  const { projects, createProject } = useProjects();
  const { resolveTagNames, setTodoTags } = useTags();

  const {
    data: rawTodos = [],
    error,
    isLoading: loading,
    mutate: refetch,
  } = useSWR(SWR_KEYS.ALL_TODOS, () => todosApi.list(), {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const todos = useMemo(() => sortTodos(rawTodos), [rawTodos]);

  const {
    createTodo,
    toggleTodo,
    deleteTodo,
    updateTodo,
    toggleManyTodos,
    updateManyTodos,
    duplicateTodo,
  } = useTodoMutations();

  /**
   * Crée une tâche depuis la saisie intelligente. `defaults` porte les défauts
   * de la vue courante (capturer dans Aujourd'hui planifie aujourd'hui, dans
   * Un jour range à « Un jour »…) : ils ne s'appliquent QUE si aucune date n'a
   * été reconnue dans le texte — ce que l'utilisateur écrit prime toujours.
   *
   * Le `#nom` de l'omnibar désigne désormais un PROJET, plus une liste en texte
   * libre : on résout vers un projet existant (insensible à la casse, même
   * politique que la réconciliation Rust) ou on en crée un. La colonne `list`
   * n'est plus jamais écrite.
   */
  const createTodoFromSmart = async (
    taskData: SmartTaskData,
    options?: {
      /** Défauts de DATE — écartés dès qu'une date est reconnue dans le texte. */
      whenUndated?: Partial<CreateTodoInput>;
      /** Rattachement du conteneur ouvert — appliqué même si une date est saisie
       *  (« appeler Jean demain » dans un projet va dans le projet ET demain). */
      container?: Partial<CreateTodoInput>;
    },
  ) => {
    const dueDate = taskData.dueDate ? toLocalISODate(taskData.dueDate) : null;

    let projectId: string | null = null;
    if (taskData.list) {
      const name = taskData.list.trim();
      const existing = projects.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      projectId = existing ? existing.id : (await createProject({ name })).id;
    }

    const payload: CreateTodoInput = {
      text: taskData.text,
      note: taskData.note ?? null,
      priority: taskData.priority ?? "normal",
      // Une date saisie est un « quand je m'y mets » (planification) — jamais
      // une échéance. Celle-ci ne se pose que dans le panneau de détail.
      scheduled_for: dueDate,
      due_date: null,
      ...(dueDate ? {} : options?.whenUndated),
      ...options?.container,
      // Un `#projet` explicitement tapé prime sur le conteneur ouvert (et exclut
      // le rattachement direct à un domaine : les deux ne coexistent pas).
      ...(projectId ? { project_id: projectId, area_id: null } : {}),
    };
    const result = await createTodo(payload);

    // Les tags se posent APRÈS la création : `set_todo_tags` reste le seul
    // écrivain de `task_tags` (une seule sémantique, un seul endroit à tester).
    if (taskData.tags?.length) {
      const ids = await resolveTagNames(taskData.tags);
      if (ids.length) await setTodoTags(result.id, ids);
    }

    // Une tâche sans date n'est pas « planifiée » : elle est capturée, à trier.
    toast.success(
      payload.scheduled_for ? "Tâche planifiée" : "Tâche capturée",
    );
    return result;
  };

  // Sélecteurs dérivés (mémorisés)
  const getTodosByStatus = useMemo(
    () => (status: TodoStatus) => todos.filter((todo) => todo.status === status),
    [todos],
  );

  const getTodosByDate = useMemo(
    () => (date: string) => todos.filter((todo) => todo.scheduled_for === date),
    [todos],
  );

  const getTodosByPriority = useMemo(
    () => (priority: Priority) => todos.filter((todo) => todo.priority === priority),
    [todos],
  );

  const getTodayTodos = useMemo(() => {
    const today = todayLocalISODate();
    return todos.filter((todo) => todo.scheduled_for === today);
  }, [todos]);

  const getOverdueTodos = useMemo(() => {
    const today = todayLocalISODate();
    return todos.filter(
      (todo) => todo.due_date && todo.due_date < today && todo.status === "pending",
    );
  }, [todos]);

  // Noms des projets actifs (triés) — alimente l'autocomplétion `#` de
  // l'omnibar. Vient désormais de la table `projects`, plus d'un scan des
  // chaînes `todos.list` : la réconciliation au démarrage a fait la bascule.
  const lists = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "fr")),
    [projects],
  );

  return {
    todos,
    loading,
    error: error?.message ?? null,
    createTodoFromSmart,
    toggleTodo,
    deleteTodo,
    updateTodo,
    toggleManyTodos,
    updateManyTodos,
    duplicateTodo,
    getTodosByStatus,
    getTodosByDate,
    getTodosByPriority,
    getTodayTodos,
    getOverdueTodos,
    lists,
    refetch,
  };
};
