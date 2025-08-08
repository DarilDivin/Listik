// components/TitleBar.tsx
'use client';

import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
            <div className="w-3 h-0.5 bg-gray-600"></div>
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
              <div className="relative">
                <div className="w-2.5 h-2.5 border border-gray-600 bg-transparent absolute -top-0.5 -left-0.5"></div>
                <div className="w-2.5 h-2.5 border border-gray-600 bg-white"></div>
              </div>
            ) : (
              <div className="w-3 h-3 border border-gray-600 bg-transparent"></div>
            )}
          </button>
        )}

        {showClose && (
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-red-400 hover:text-white transition-colors group"
            aria-label="Close"
            title="Fermer"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 4.586L10.293.293a1 1 0 111.414 1.414L7.414 6l4.293 4.293a1 1 0 11-1.414 1.414L6 7.414l-4.293 4.293a1 1 0 01-1.414-1.414L4.586 6 .293 1.707A1 1 0 011.707.293L6 4.586z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}