// components/TitleBar.tsx
'use client';

import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window'; 
import { BreakoutRoomRegular, SelectAllOffRegular, SquareMultipleRegular } from '@fluentui/react-icons'; // Import Fluent UI icons
import { ChromeRestoreIcon } from '@fluentui/react-icons-mdl2';

interface TitleBarProps {
  title?: string;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
  className?: string;
}

export default function TitleBar({ 
  title = "Listik", 
  showMinimize = true, 
  showMaximize = true, 
  showClose = true,
  className = ""
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowLabel, setWindowLabel] = useState<string>('');

  // Vérifier l'état de la fenêtre au montage
  useEffect(() => {
    const checkWindow = async () => {
      try {
        const window = getCurrentWindow();
        const label = window.label;
        const maximized = await window.isMaximized();
        setWindowLabel(label);
        setIsMaximized(maximized);
      } catch (error) {
        console.warn('Impossible de vérifier l\'état de la fenêtre:', error);
      }
    };

    checkWindow();
  }, []);

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
      console.log('✅ Fenêtre minimisée');
    } catch (error) {
      console.error('❌ Erreur minimize:', error);
    }
  };

  const handleMaximize = async () => {
    // Vérifier si cette fenêtre peut être maximisée
    if (windowLabel == 'daily') {
      console.warn('⚠️ Maximize non disponible pour daily');
      return;
    }

    try {
      const window = getCurrentWindow();
      if (isMaximized) {
        await window.unmaximize();
        setIsMaximized(false);
        console.log('✅ Fenêtre restaurée');
      } else {
        await window.maximize();
        setIsMaximized(true);
        console.log('✅ Fenêtre maximisée');
      }
    } catch (error) {
      console.error('❌ Erreur maximize/unmaximize:', error);
    }
  };

  const handleClose = async () => {
  try {
    const window = getCurrentWindow();
    
    // Vérifier si la fenêtre existe encore avant de la fermer
    const isValid = await window.isVisible().catch(() => false);
    if (!isValid) {
      console.warn('⚠️ Fenêtre déjà fermée ou invalide');
      return;
    }
    
    await window.close();
    console.log('✅ Fenêtre fermée');
  } catch (error) {
    console.error('❌ Erreur close:', error);
  }
};

  // Masquer le bouton maximize si pas sur la fenêtre principale
  const shouldShowMaximize = showMaximize && windowLabel !== 'daily';

  return (
    <div 
      className={`flex items-center justify-between h-8 bg-white/00 backdrop-blur-sm select-none ${className}`}
      data-tauri-drag-region
    >
      {/* Titre */}
      <div className="flex items-center px-4 text-sm font-medium text-gray-700">
        {title}
      </div>

      {/* Boutons de contrôle */}
      <div className="flex items-center">
        {showMinimize && (
          <button
            onClick={handleMinimize}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-200/50 transition-colors"
            aria-label="Minimize"
            title="Minimiser"
          >
            {/* <div className="w-3 h-0.5 bg-gray-600"></div> */}
            {/* Minimize - Style Windows 11 */}
            <div className="w-3 h-px bg-gray-700 group-hover:bg-gray-900"></div>
          </button>
        )}

        {shouldShowMaximize && (
          <button
            onClick={handleMaximize}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-200/50 transition-colors"
            aria-label={isMaximized ? "Unmaximize" : "Maximize"}
            title={isMaximized ? "Restaurer" : "Agrandir"}
          >
            {isMaximized ? (
              /* Restore - Style Windows 11 */
              // <SelectAllOffRegular className="w-4 h-4 text-gray-700 group-hover:text-gray-900" />
              <SquareMultipleRegular />
            ) : (
              /* Maximize - Style Windows 11 */
              <div className="w-3 h-3 border border-gray-700 rounded-[2px] group-hover:border-gray-900 bg-transparent"></div>
            )}
          </button>
        )}

        {showClose && (
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-all duration-150 group"
            aria-label="Close"
            title="Fermer"
          >
            {/* Close - Style Windows 11 */}
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-700 group-hover:text-white">
              <path 
                d="M0.146 0.146a.5.5 0 0 1 .708 0L5 4.293 9.146.146a.5.5 0 0 1 .708.708L5.707 5l4.147 4.146a.5.5 0 0 1-.708.708L5 5.707.854 9.854a.5.5 0 0 1-.708-.708L4.293 5 .146.854a.5.5 0 0 1 0-.708z" 
                fill="currentColor"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}