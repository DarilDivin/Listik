import useSWR from "swr";
import { useMemo } from "react";
import { toast } from "sonner";
import { todosApi } from "@/features/todos/api";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { sortTodos } from "@/features/todos/sort";
import type { Priority, TodoStatus } from "@/features/todos/types";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";

interface SmartTaskData {
  text: string;
  note?: string;
  dueDate?: Date | null;
  priority?: Priority;
  list?: string | null;
}

export const usePlannerTodos = () => {
  useTodosSync();

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

  const { createTodo, toggleTodo, deleteTodo, updateTodo } = useTodoMutations();

  const createTodoFromSmart = async (taskData: SmartTaskData) => {
    const dueDate = taskData.dueDate ? toLocalISODate(taskData.dueDate) : null;
    const result = await createTodo({
      text: taskData.text,
      note: taskData.note ?? null,
      list: taskData.list ?? null,
      priority: taskData.priority ?? "normal",
      scheduled_for: dueDate,
      due_date: dueDate,
    });
    toast.success("Tâche planifiée avec succès !");
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

  // Listes/projets distincts actuellement utilisés (triés).
  const lists = useMemo(() => {
    const set = new Set<string>();
    for (const t of todos) if (t.list) set.add(t.list);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [todos]);

  return {
    todos,
    loading,
    error: error?.message ?? null,
    createTodoFromSmart,
    toggleTodo,
    deleteTodo,
    updateTodo,
    getTodosByStatus,
    getTodosByDate,
    getTodosByPriority,
    getTodayTodos,
    getOverdueTodos,
    lists,
    refetch,
  };
};
