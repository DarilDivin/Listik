"use client";

import { invoke } from "@tauri-apps/api/core";

export default function HomePage() {
  const openPlanner = async () => {
    try {
      await invoke("open_planner_window");
    } catch (error) {
      console.error("Erreur lors de l'ouverture du planificateur:", error);
    }
  };

  const toggleDaily = async () => {
    try {
      await invoke("toggle_daily_window");
    } catch (error) {
      console.error("Erreur lors de l'ouverture de la vue quotidienne:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center m-4">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📝 Listik</h1>
          <p className="text-xl text-gray-600">
            Votre gestionnaire de tâches quotidiennes
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-4">Ouvrir une fenêtre :</h2>

          <div className="space-y-3">
            <button
              onClick={toggleDaily}
              className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <span>📅</span>
              Vue quotidienne
            </button>

            <button
              onClick={openPlanner}
              className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2"
            >
              <span>📋</span>
              Planificateur
            </button>
          </div>
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">
              Raccourci clavier :
            </h3>
            <div className="flex items-center justify-center gap-2">
              <kbd className="bg-gray-200 px-2 py-1 rounded text-xs font-mono">
                Ctrl
              </kbd>
              <span>+</span>
              <kbd className="bg-gray-200 px-2 py-1 rounded text-xs font-mono">
                Shift
              </kbd>
              <span>+</span>
              <kbd className="bg-gray-200 px-2 py-1 rounded text-xs font-mono">
                T
              </kbd>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Ouvre/ferme la vue quotidienne depuis n'importe où
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
