import { invoke } from "@tauri-apps/api/core";

/** Actions d'ouverture/fermeture des fenêtres (commandes Tauri). */
export function useWindowActions() {
  const openPlanner = () =>
    invoke("open_planner_window").catch((e) =>
      console.error("Ouverture du planificateur impossible:", e),
    );

  const toggleQuick = () =>
    invoke("toggle_quick_window").catch((e) =>
      console.error("Bascule de la capture rapide impossible:", e),
    );

  const showMain = () =>
    invoke("show_main_window").catch((e) =>
      console.error("Affichage de la fenêtre principale impossible:", e),
    );

  return { openPlanner, toggleQuick, showMain };
}
