'use client';

import { Todo, TodoStatus, Priority } from '@/types/todo';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
}

export default function TodoList({ todos, onToggle }: TodoListProps) {
  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case Priority.High: return '🔴';
      case Priority.Normal: return '🔵';
      case Priority.Low: return '🟢';
      default: return '⚪';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  };

  if (todos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="text-4xl mb-4">📝</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune tâche</h3>
        <p className="text-gray-600">Créez votre première tâche pour commencer !</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="divide-y divide-gray-200">
        {todos.map((todo) => (
          <div key={todo.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => onToggle(todo.id)}
                className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  todo.status === TodoStatus.Completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 hover:border-indigo-500'
                }`}
              >
                {todo.status === TodoStatus.Completed && '✓'}
              </button>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <p className={`text-sm ${
                    todo.status === TodoStatus.Completed
                      ? 'line-through text-gray-500'
                      : 'text-gray-900'
                  }`}>
                    {todo.text}
                  </p>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-lg">
                      {getPriorityIcon(todo.priority)}
                    </span>
                  </div>
                </div>

                {/* Métadonnées */}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  {todo.scheduled_for && (
                    <span className="flex items-center gap-1">
                      📅 Planifié: {formatDate(todo.scheduled_for)}
                    </span>
                  )}
                  {todo.due_date && (
                    <span className="flex items-center gap-1 text-orange-600">
                      ⏰ Échéance: {formatDate(todo.due_date)}
                    </span>
                  )}
                  <span>
                    Créé: {formatDate(todo.created_at.split('T')[0])}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}