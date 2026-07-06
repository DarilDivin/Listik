"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SearchOverlay } from "@/components/SearchOverlay";

/**
 * App shell : barre latérale persistante + zone de contenu. Toutes les sections
 * (Planificateur, Notes, Réglages, Assistant) vivent dans CETTE fenêtre, via le
 * routing client. La capture rapide (`/quick`) reste hors de ce groupe.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex h-full">
      <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
