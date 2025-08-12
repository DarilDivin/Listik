"use client";

import SmartTaskInput from "@/components/SmartTaskInput";
import { useTodos } from "@/hooks/useTodos";
import { TodoStatus, Priority } from "@/types/todo";
import { useState } from "react";

export default function DailyPage() {
  const {
    todos,
    loading,
    error,
    createTodoFromSmart,
    toggleTodo,
    createTodo,
    openPlanner,
  } = useTodos();

  const [newTodoText, setNewTodoText] = useState("");

  // Filtrer seulement les todos d'aujourd'hui
  const todayTodos = todos.filter((todo) => {
    if (!todo.scheduled_for) return false;
    const today = new Date().toISOString().split("T")[0];
    return todo.scheduled_for === today;
  });

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    await createTodo({
      text: newTodoText,
      priority: Priority.Normal,
      scheduled_for: new Date().toISOString().split("T")[0],
    });

    setNewTodoText("");
  };

  const handleCreateTodo = async (taskData: {
    text: string;
    dueDate?: Date | null;
    priority?: Priority;
  }) => {
    await createTodoFromSmart(taskData);
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case Priority.High:
        return "bg-red-500";
      case Priority.Normal:
        return "bg-orange-500";
      case Priority.Low:
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="h-full rounded bg-gradient-to-b from-gray-200 to-gray-300 flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="relative w-full h-full rounded bg-gradient-to-b from-gray-200 to-gray-300 p-4 overflow-y-scroll">
      <button
        onClick={openPlanner}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors absolute top-2 right-2 bg-white/00 px-2 py-1 rounded cursor-pointer"
      >
        Plan →
      </button>
      <header className="px-8 py-6">
        <div className="flex flex-col justify-center items-center max-w-7xl mx-auto h-full gap-10">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {today.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
              })}
              ,
              <span className="text-gray-400 ml-2">
                {today.toLocaleDateString("fr-FR", { month: "long" })}
              </span>
            </h1>
          </div>
        </div>
      </header>
      <section className="max-w-2xl mx-auto mt-4 h-[450px] pb-[50px] overflow-y-scroll scroll-smooth">
        {error && (
          <div className="text-red-500 text-sm mb-2">Erreur: {error}</div>
        )}
        {todayTodos.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            Aucune tâche prévue pour aujourd'hui.
          </div>
        ) : (
          <ul className="space-y-2">
            {todayTodos.map((todo) => (
              <li
                key={todo.id}
                className={`flex items-center bg-white rounded shadow p-3 gap-3`}
              >
                <button
                  onClick={() => toggleTodo(todo.id)}
                  className={`w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center mr-2 ${
                    todo.status === TodoStatus.Completed
                      ? "bg-green-400 border-green-400"
                      : ""
                  }`}
                  aria-label="Marquer comme terminé"
                >
                  {todo.status === TodoStatus.Completed && (
                    <span className="text-white text-xs">&#10003;</span>
                  )}
                </button>
                <span
                  className={`flex-1 text-gray-900 ${
                    todo.status === TodoStatus.Completed
                      ? "line-through text-gray-400"
                      : ""
                  }`}
                >
                  {todo.text}
                </span>
                <span
                  className={`w-3 h-3 rounded-full ${getPriorityColor(
                    todo.priority
                  )}`}
                  title={`Priorité: ${todo.priority}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="absolute bottom-2 left-2 right-2 bg-black/2  p-1 rounded-2xl">
        <SmartTaskInput
          onSubmit={handleCreateTodo}
          placeholder="Ajouter une tâche"
        />
      </div>
    </div>
  );
}
