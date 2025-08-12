import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Todo, CreateTodo, TodoStatus, Priority } from '@/types/todo';
import { toast } from 'sonner';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Récupérer les todos du jour
  const getTodayTodos = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await invoke<Todo[]>('get_today_todos');
      setTodos(result);
    } catch (err) {
      setError(err as string);
      console.error('Erreur lors de la récupération des todos:', err);
    } finally {
      setLoading(false);
    }
  };

  // Créer un nouveau todo avec SmartTaskInput
  const createTodoFromSmart = async (taskData: {
    text: string;
    dueDate?: Date | null;
    priority?: Priority;
  }): Promise<Todo | null> => {
    setError(null);
    
    try {
      // Si pas de date, utiliser aujourd'hui par défaut
      const scheduledDate = taskData.dueDate || new Date();

      const createData: CreateTodo = {
        text: taskData.text,
        priority: taskData.priority || Priority.Normal,
        due_date: taskData.dueDate ? taskData.dueDate.toISOString().split('T')[0] : undefined,
        scheduled_for: scheduledDate.toISOString().split('T')[0],
      };

      const newTodo = await invoke<Todo>('create_todo', { todoData: createData });
      setTodos(prev => [...prev, newTodo]);
      toast.success("Event has been created.")
      return newTodo;
    } catch (err) {
      setError(err as string);
      toast.error("Erreur lors de la création de l'événement.", {
          description: err instanceof Error ? err.message : "Unknown error",
          action: {
            label: "Info",
            onClick: () => console.log("Info"),
          },
        });
      console.error('Erreur lors de la création du todo:', err);
      return null;
    }
  };

  // Créer un nouveau todo (ancienne méthode)
  const createTodo = async (todoData: CreateTodo): Promise<Todo | null> => {
    setError(null);
    
    try {
      const newTodo = await invoke<Todo>('create_todo', { todoData });
      setTodos(prev => [...prev, newTodo]);
      return newTodo;
    } catch (err) {
      setError(err as string);
      console.error('Erreur lors de la création du todo:', err);
      return null;
    }
  };

  // Basculer le statut d'un todo
  const toggleTodo = async (todoId: string): Promise<void> => {
    setError(null);
    
    try {
      const updatedTodo = await invoke<Todo>('toggle_todo', { todoId });
      setTodos(prev => 
        prev.map(todo => 
          todo.id === todoId ? updatedTodo : todo
        )
      );
    } catch (err) {
      setError(err as string);
      console.error('Erreur lors du toggle du todo:', err);
    }
  };

  // Ouvrir la fenêtre planificateur
  const openPlanner = async () => {
    try {
      await invoke('open_planner_window');
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du planificateur:', err);
    }
  };

  // Charger les todos au montage du composant
  useEffect(() => {
    getTodayTodos();
  }, []);

  return {
    todos,
    loading,
    error,
    createTodo,
    createTodoFromSmart, // Nouvelle fonction pour SmartTaskInput
    toggleTodo,
    getTodayTodos,
    openPlanner
  };
}