"use client";

import { useTodos } from "@/hooks/useTodos";
import { TodoStatus, Priority } from "@/types/todo";
import { useState } from "react";
import SmartTaskInput from "@/components/SmartTaskInput";
import TodoList from "@/components/TodoList";
import TitleBar from "@/components/TitleBar";

export default function PlannerPage() {
  const { todos, loading, error, createTodoFromSmart, toggleTodo } = useTodos();
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const filteredTodos = todos.filter((todo) => {
    if (filter === "pending") return todo.status === TodoStatus.Pending;
    if (filter === "completed") return todo.status === TodoStatus.Completed;
    return true;
  });

  const handleCreateTodo = async (taskData: {
    text: string;
    dueDate?: Date | null;
    priority?: Priority;
  }) => {
    await createTodoFromSmart(taskData);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-16px)] rounded bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="h-full rounded bg-gradient-to-br from-gray-200 to-gray-300 overflow-y-scroll">
      {/* Header avec date */}
      <header className="px-8 py-6 h-[40vh]">
        <div className="flex flex-col justify-center items-center max-w-7xl mx-auto h-full gap-10">
          <div>
            <h1 className="text-6xl font-semibold text-gray-900">
              {today.toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
              })}
              ,
              <span className="text-gray-400 ml-2">
                {today.toLocaleDateString("en-US", { month: "long" })}
              </span>
            </h1>
          </div>
          <div className="font-sans flex flex-col items-center justify-center w-full">
            <SmartTaskInput
              onSubmit={handleCreateTodo}
              placeholder="Ajouter une tâche"
            />
          </div>
        </div>
      </header>

            <div className="max-w-6xl mx-auto px-8 py-8">
        {error && (
          <div className="text-red-600 text-sm mb-8 flex items-center gap-2">
            <div className="w-1 h-1 bg-red-500 rounded-full"></div>
            {error}
          </div>
        )}
      
        {/* Filtres ultra-propres */}
        <div className="flex items-center gap-8 mb-12 pb-6 border-b border-gray-100/50">
          {[
            { key: "all", label: "All", count: todos.length },
            { key: "pending", label: "Pending", count: todos.filter((t) => t.status === TodoStatus.Pending).length },
            { key: "completed", label: "Completed", count: todos.filter((t) => t.status === TodoStatus.Completed).length }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`
                group flex items-center gap-3 text-sm transition-all duration-200
                ${filter === key
                  ? "text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
                }
              `}
            >
              <span>{label}</span>
              <span className={`
                text-xs px-2 py-1 rounded-full transition-all duration-200
                ${filter === key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                }
              `}>
                {count}
              </span>
              {filter === key && (
                <div className="w-1 h-1 bg-gray-900 rounded-full"></div>
              )}
            </button>
          ))}
        </div>
      
        {/* Liste simple */}
        <TodoList todos={filteredTodos} onToggle={toggleTodo} />
      </div>
    </div>
  );
}
