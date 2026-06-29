"use client";

import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Zap, LayoutList, Settings } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  const openPlanner = () =>
    invoke("open_planner_window").catch((e) =>
      console.error("Ouverture du planificateur impossible:", e),
    );

  const toggleQuick = () =>
    invoke("toggle_quick_window").catch((e) =>
      console.error("Ouverture de la capture rapide impossible:", e),
    );

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-background p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(60% 70% at 50% -10%, oklch(0.62 0.09 265 / 0.13), transparent 70%)",
        }}
      />

      <div className="absolute right-5 top-5 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => router.push("/settings")}
          aria-label="Paramètres"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Settings size={16} />
        </button>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-5xl tracking-tight text-foreground">Listik</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre gestionnaire de tâches, épuré.
        </p>

        <div className="mt-9 space-y-2.5">
          <button
            onClick={toggleQuick}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Zap size={16} />
            Tâche rapide
          </button>

          <button
            onClick={openPlanner}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <LayoutList size={16} />
            Planificateur
          </button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span>Ouvrir d&apos;un raccourci</span>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
            Alt
          </kbd>
          <span className="text-muted-foreground/50">+</span>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
            Q
          </kbd>
        </div>
      </div>
    </div>
  );
}
