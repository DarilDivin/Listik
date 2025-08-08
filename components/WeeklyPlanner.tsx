'use client';

import { Todo, TodoStatus, Priority } from '@/types/todo';
import { useState } from 'react';

interface WeeklyPlannerProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

const categories = [
  { name: 'Daily Habits', color: 'bg-orange-100 text-orange-800' },
  { name: 'Personal Projects', color: 'bg-blue-100 text-blue-800' },
  { name: 'Work', color: 'bg-green-100 text-green-800' },
];

export default function WeeklyPlanner({ todos, onToggle, selectedDate, onDateSelect }: WeeklyPlannerProps) {
  // Exemple de tâches pour reproduire l'image
  const sampleTasks = [
    { id: '1', category: 'Daily Habits', task: 'Work for at least 30 minutes', priority: 'high', completed: false },
    { id: '2', category: 'Daily Habits', task: 'Sleep at least 7 hours', priority: 'high', completed: false },
    { id: '3', category: 'Personal Projects', task: 'Marketing strategy', priority: 'high', completed: false },
    { id: '4', category: 'Work', task: 'Design website + launch', priority: 'medium', completed: false },
    { id: '5', category: 'Daily Habits', task: 'Design for at least 30 minutes', priority: 'medium', completed: false },
    { id: '6', category: 'Work', task: 'Review analytics', priority: 'low', completed: false },
    { id: '7', category: 'Daily Habits', task: 'Yoga before bed', priority: 'low', completed: false },
    { id: '8', category: 'Work', task: 'Define marketing startegy', priority: 'low', completed: false },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-8">
        <div className="grid grid-cols-4 gap-8">
          {/* Colonne des catégories */}
          <div className="space-y-6">
            {categories.map((category, index) => (
              <div key={index} className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${category.color}`}>
                    {category.name}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Colonnes des tâches */}
          <div className="col-span-3">
            <div className="space-y-3">
              {sampleTasks.map((task, index) => (
                <div key={task.id} className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg group transition-colors">
                  {/* Checkbox */}
                  <button
                    onClick={() => onToggle(task.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      task.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {task.completed && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* Texte de la tâche */}
                  <div className="flex-1">
                    <span className={`text-gray-900 ${task.completed ? 'line-through text-gray-500' : ''}`}>
                      {task.task}
                    </span>
                  </div>

                  {/* Indicateur de priorité */}
                  <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}