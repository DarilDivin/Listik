"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingDock } from "@/components/FloatingDock";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SidebarSlotProvider, useSidebarSlot } from "@/components/sidebar-slot";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useUIPrefs } from "@/components/ui-prefs";
import { cn } from "@/lib/utils";

interface ShellProps {
  children: ReactNode;
  onOpenSearch: () => void;
}

/**
 * Shell du mode dock. Sans contenu latéral : pilule flottante centrée à
 * gauche, comme toujours. Quand la page fournit un contenu (`SidebarSlot`,
 * ex. le rail du Planificateur) : une colonne à plat le loge — hairline,
 * pas de carte — et la pilule vient s'aimanter à son pied en rangée
 * horizontale (les `layoutId` du dock font le voyage).
 */
function DockShell({ children, onOpenSearch }: ShellProps) {
  const { hasContent, setContainer } = useSidebarSlot();

  return (
    <div className="relative flex h-full min-h-0">
      {hasContent ? (
        <div className="flex h-full w-56 shrink-0 flex-col border-r border-border/60 max-md:w-14">
          <div ref={setContainer} className="min-h-0 flex-1" />
          <div className="flex shrink-0 justify-center px-2 pb-4">
            <FloatingDock docked onOpenSearch={onOpenSearch} />
          </div>
        </div>
      ) : (
        <FloatingDock onOpenSearch={onOpenSearch} />
      )}
      <main
        className={cn(
          "h-full min-w-0 flex-1 overflow-hidden",
          !hasContent && "pl-20",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Le filet sous le glisser-déposer.
 *
 * `dragDropEnabled: false` laisse WebView2 traiter les fichiers lâchés comme
 * le ferait un navigateur — c'est ce qui permet au journal d'en recevoir
 * (voir `PiecePlugin`), et c'est aussi ce qui fait QUITTER la page quand on
 * lâche à côté : le webview va afficher le fichier, et l'app est perdue
 * jusqu'au rechargement.
 *
 * On avale donc tout dépôt qui n'a pas été pris ailleurs. Les zones qui en
 * veulent vraiment appellent `preventDefault` avant nous et ne sont pas
 * concernées ; ici, il ne reste que les ratés.
 */
function useFilet() {
  useEffect(() => {
    const avaler = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", avaler);
    window.addEventListener("drop", avaler);
    return () => {
      window.removeEventListener("dragover", avaler);
      window.removeEventListener("drop", avaler);
    };
  }, []);
}

/**
 * App shell : navigation au choix de l'utilisateur (Réglages →
 * Personnalisation) — dock flottant d'icônes (défaut) ou sidebar repliable.
 * Tout vit SOUS la TitleBar (système de survol restauré dans le layout
 * racine). La capture rapide (`/quick`) reste hors de ce groupe.
 *
 * `SidebarSlotProvider` : « un seul meuble » — une page peut téléporter son
 * contenu latéral (rail du Planificateur) dans le corps de la sidebar ou dans
 * la colonne du mode dock, pendant que la nav d'app se replie en icônes.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { nav } = useUIPrefs();
  const openSearch = () => setSearchOpen(true);
  useFilet();

  return (
    <SidebarSlotProvider>
      {nav === "dock" ? (
        <DockShell onOpenSearch={openSearch}>{children}</DockShell>
      ) : (
        <SidebarProvider className="relative h-full min-h-0">
          <AppSidebar onOpenSearch={openSearch} />
          <SidebarInset className="h-full min-w-0 overflow-hidden">
            {children}
          </SidebarInset>
        </SidebarProvider>
      )}
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarSlotProvider>
  );
}
