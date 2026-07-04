"use client";

import { AppSidebar } from "@/components/AppSidebar";

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
  return (
    <div className="flex h-full">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
