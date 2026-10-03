"use client";

import { useCallback } from "react";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

/**
 * Crée une tâche à partir d'une phrase analysée (`SmartTaskData`), comme la
 * fenêtre rapide : le projet nommé par `#nom` est retrouvé ou créé, la tâche
 * est datée d'aujourd'hui faute de date, et les tags sont rattachés. Partagé
 * par la fenêtre rapide et le champ de secours de l'accueil, pour qu'une
 * capture se comporte partout de la même façon.
 */
export function useCaptureTask() {
  const { createTodo } = useTodoMutations();
  const { projects, createProject } = useProjects();
  const { resolveTagNames, setTodoTags } = useTags();

  return useCallback(
    async (data: SmartTaskData) => {
      const due = data.dueDate ? toLocalISODate(data.dueDate) : null;

      let projectId: string | null = null;
      if (data.list) {
        const name = data.list.trim();
        const existing = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
        projectId = existing ? existing.id : (await createProject({ name })).id;
      }

      const todo = await createTodo({
        text: data.text,
        note: data.note ?? null,
        priority: data.priority ?? "normal",
        scheduled_for: due ?? todayLocalISODate(),
        due_date: null,
        project_id: projectId,
      });

      if (data.tags?.length) {
        const ids = await resolveTagNames(data.tags);
        if (ids.length) await setTodoTags(todo.id, ids);
      }

      return todo;
    },
    [createTodo, createProject, projects, resolveTagNames, setTodoTags],
  );
}
