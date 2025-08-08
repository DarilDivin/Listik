// Modifie la classe pour vérifier la fenêtre actuelle :

import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';
import { Window } from '@tauri-apps/api/window';

export class GlobalShortcutManager {
  private registeredShortcut: string | null = null;

  async setupGlobalShortcut(): Promise<{ success: boolean; shortcut?: string }> {
    // Vérifier si on est dans la fenêtre principale
    try {
      const mainWindow = await Window.getByLabel('main');
      const label = mainWindow?.label;

      console.log(`🔍 Fenêtre actuelle: ${label}`);

      if (label !== 'main') {
        console.log('⚠️ Raccourcis globaux disponibles uniquement depuis la fenêtre principale');
        return { success: false };
      }
    } catch (error) {
      console.error('Erreur lors de la vérification de la fenêtre:', error);
      return { success: false };
    }

    const shortcutsToTry = [
      'Ctrl+Shift+L',
      'Ctrl+Alt+L', 
      'Alt+Shift+L',
      'F13',
      'F14',
      'Shift+F11',
      'Ctrl+Shift+J',
      'Ctrl+Alt+J'
    ];

    for (const shortcut of shortcutsToTry) {
      try {
        console.log(`🔄 Tentative avec ${shortcut}...`);
        
        // Enregistrer directement sans vérifier (pour éviter l'erreur de permission)
        await register(shortcut, () => {
          console.log(`🎯 Raccourci ${shortcut} activé !`);
          this.toggleDailyWindow();
        });

        console.log(`✅ Raccourci ${shortcut} configuré avec succès !`);
        this.registeredShortcut = shortcut;
        return { success: true, shortcut };

      } catch (error) {
        console.log(`❌ Erreur avec ${shortcut}:`, error);
        continue;
      }
    }

    return { success: false };
  }

  private async toggleDailyWindow() {
    try {
      await invoke('toggle_daily_window');
    } catch (error) {
      console.error('Erreur lors du toggle:', error);
    }
  }

  async cleanup() {
    if (this.registeredShortcut) {
      try {
        await unregister(this.registeredShortcut);
        console.log(`🧹 Raccourci ${this.registeredShortcut} désenregistré`);
      } catch (error) {
        console.error('Erreur lors du nettoyage:', error);
      }
    }
  }
}