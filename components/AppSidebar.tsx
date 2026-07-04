"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Settings, Sparkles, StickyNote } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutList;
  /** Pastille d'icône (standard : lavis 8 % + glyphe profond). */
  color: string;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Planificateur",
    icon: LayoutList,
    color: "bg-sky-500/8 text-sky-600 dark:text-sky-400",
  },
  {
    href: "/notes",
    label: "Notes",
    icon: StickyNote,
    color: "bg-amber-500/8 text-amber-600 dark:text-amber-400",
  },
  {
    href: "/assistant",
    label: "Assistant",
    icon: Sparkles,
    color: "bg-violet-500/8 text-violet-600 dark:text-violet-400",
  },
  {
    href: "/settings",
    label: "Réglages",
    icon: Settings,
    color: "bg-slate-500/8 text-slate-600 dark:text-slate-400",
  },
];

/** Barre latérale de navigation de la fenêtre principale (app shell). */
export function AppSidebar() {
  const raw = usePathname() ?? "/";
  const pathname = raw.replace(/\/$/, "") || "/";

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border/40 px-3 py-4">
      <div className="px-2 pb-5">
        <span className="text-[1.35rem] font-bold tracking-tight text-foreground">
          Listik
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, color }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-[7px]",
                  color,
                )}
              >
                <Icon size={14} strokeWidth={2.1} />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between px-1 pt-2">
        <span className="font-mono text-[11px] text-muted-foreground/50">v0.1.0</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
