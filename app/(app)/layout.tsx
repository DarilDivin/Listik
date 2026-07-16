"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingDock } from "@/components/FloatingDock";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useUIPrefs } from "@/components/ui-prefs";

/**
 * App shell : navigation au choix de l'utilisateur (Réglages →
 * Personnalisation) — dock flottant d'icônes (défaut) ou sidebar repliable.
 * Tout vit SOUS la TitleBar (système de survol restauré dans le layout
 * racine). La capture rapide (`/quick`) reste hors de ce groupe.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { nav } = useUIPrefs();

  return (
    <>
      {nav === "dock" ? (
        <div className="relative h-full min-h-0">
          <FloatingDock onOpenSearch={() => setSearchOpen(true)} />
          <main className="h-full min-w-0 overflow-hidden pl-20">
            {children}
          </main>
        </div>
      ) : (
        <SidebarProvider className="relative h-full min-h-0">
          <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
          <SidebarInset className="h-full min-w-0 overflow-hidden">
            {children}
          </SidebarInset>
        </SidebarProvider>
      )}
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
