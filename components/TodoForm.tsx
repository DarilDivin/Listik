'use client';

import { useState } from 'react';
import { Priority, CreateTodo } from '@/types/todo';

interface TodoFormProps {
  onSubmit: (todo: CreateTodo) => void;
  onCancel: () => void;
}

export default function TodoForm({ onSubmit, onCancel }: TodoFormProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.Normal);
  const [dueDate, setDueDate] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const todoData: CreateTodo = {
      text: text.trim(),
      priority,
      due_date: dueDate || undefined,
      scheduled_for: scheduledFor || undefined,
    };

    onSubmit(todoData);
    
    // Reset form
    setText('');
    setPriority(Priority.Normal);
    setDueDate('');
    setScheduledFor('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Texte de la tâche */}
      <div>
        <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-1">
          Tâche *
        </label>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Que devez-vous faire ?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          rows={3}
          required
        />
      </div>

      {/* Priorité */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
          Priorité
        </label>
        <select
          id="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value={Priority.Low}>🟢 Basse</option>
          <option value={Priority.Normal}>🔵 Normale</option>
          <option value={Priority.High}>🔴 Haute</option>
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="scheduledFor" className="block text-sm font-medium text-gray-700 mb-1">
            Planifié pour
          </label>
          <input
            type="date"
            id="scheduledFor"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        
        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
            Échéance
          </label>
          <input
            type="date"
            id="dueDate"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Boutons */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Créer la tâche
        </button>
      </div>
    </form>
  );
}