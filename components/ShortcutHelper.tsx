"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function ShortcutHelper() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 pour afficher l'aide
      if (e.key === "F1") {
        e.preventDefault();
        setShowHelp(true);
      }
      // Échap pour fermer l'aide
      if (e.key === "Escape") {
        setShowHelp(false);
      }
      // Ctrl+Shift+T pour toggle daily (local)
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        invoke("toggle_daily_window").catch(console.error);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!showHelp) {
    return (
      <div className="fixed bottom-4 right-4 text-xs text-gray-500">
        Appuyez sur F1 pour l'aide
      </div>
    );
  }

  return (
    // <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    //   <div className="bg-white rounded-lg p-6 max-w-md">
    //     <h3 className="text-lg font-semibold mb-4">Raccourcis clavier</h3>
    //     <div className="space-y-2">
    //       <div className="flex justify-between">
    //         <span className="text-sm">Vue quotidienne :</span>
    //         <div className="flex gap-1">
    //           <kbd className="bg-gray-200 px-2 py-1 rounded text-xs">Ctrl+Shift+T</kbd>
    //         </div>
    //       </div>
    //       <p className="text-xs text-gray-500">
    //         ⚠️ Fonctionne seulement quand l'app est au premier plan
    //       </p>
    //     </div>
    //     <button
    //       onClick={() => setShowHelp(false)}
    //       className="mt-4 w-full bg-gray-900 text-white py-2 rounded-lg"
    //     >
    //       Fermer
    //     </button>
    //   </div>
    // </div>
    <div className="p-3 bg-green-50 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium">Vue quotidienne :</span>
        <div className="flex gap-1">
          <kbd className="bg-green-200 px-2 py-1 rounded text-xs font-mono">
            Ctrl
          </kbd>
          <span>+</span>
          <kbd className="bg-green-200 px-2 py-1 rounded text-xs font-mono">
            Alt
          </kbd>
          <span>+</span>
          <kbd className="bg-green-200 px-2 py-1 rounded text-xs font-mono">
            L
          </kbd>
        </div>
      </div>
      <p className="text-xs text-green-700">
        ✅ Raccourci global - fonctionne depuis n'importe où !
      </p>
    </div>
  );
}
