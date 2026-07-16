"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { motion } from "motion/react";
import {
  CalendarDays,
  Search,
  Settings,
  Sparkles,
  StickyNote,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { todosApi } from "@/features/todos/api";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate } from "@/lib/date";
import { spring } from "@/lib/motion";

const NAV = [
  { href: "/", label: "Planificateur", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/settings", label: "Réglages", icon: Settings },
];

interface AppSidebarProps {
  onOpenSearch?: () => void;
}

/**
 * Sidebar (option de navigation « classique », choisie dans Réglages →
 * Personnalisation). Fond canvas sans bordure dure, items très arrondis,
 * pastille active en lavis d'accent qui glisse (layoutId). Repliable en rail
 * d'icônes (Ctrl+B). Ancrée en `absolute` : elle vit SOUS la TitleBar.
 *
 * L'icône « Planificateur » est le seul signal vivant de la sidebar : un
 * `ProgressRing` miniature (façon icône Calendrier qui affiche la vraie date)
 * remplace l'icône générique et se remplit avec la progression du jour —
 * repris de `HeroDay`, pas un décor ajouté. Les autres icônes restent sobres :
 * on concentre le geste distinctif sur un seul élément plutôt que de le
 * diluer partout.
 */
export function AppSidebar({ onOpenSearch }: AppSidebarProps) {
  const raw = usePathname() ?? "/";
  const pathname = raw.replace(/\/$/, "") || "/";

  useTodosSync();
  const { data: todos = [] } = useSWR(SWR_KEYS.ALL_TODOS, () => todosApi.list());
  const { doneToday, totalToday } = useMemo(() => {
    const todayISO = todayLocalISODate();
    const day = todos.filter((t) => t.scheduled_for === todayISO);
    return {
      doneToday: day.filter((t) => t.status === "completed").length,
      totalToday: day.length,
    };
  }, [todos]);

  return (
    <Sidebar
      collapsible="icon"
      className="absolute h-full !border-r-0"
    >
      <SidebarHeader className="pt-4">
        <div className="flex h-8 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-lg font-bold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
            Listik
          </span>
          <span className="hidden size-7 rounded-lg bg-brand-soft text-sm font-bold text-brand group-data-[collapsible=icon]:grid group-data-[collapsible=icon]:place-items-center">
            L
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {onOpenSearch && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onOpenSearch}
                    tooltip="Rechercher (Ctrl K)"
                    className="rounded-xl text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                  >
                    <Search />
                    <span>Rechercher</span>
                    <Kbd className="ml-auto bg-muted text-[10px] text-muted-foreground/70">
                      ⌃K
                    </Kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {NAV.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                const isPlanner = href === "/";
                const tooltip =
                  isPlanner && totalToday > 0
                    ? `${label} · ${doneToday}/${totalToday} aujourd'hui`
                    : label;
                return (
                  <SidebarMenuItem key={href} className="relative">
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-brand-soft"
                        transition={spring.snappy}
                      />
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={tooltip}
                      className="relative z-10 rounded-xl bg-transparent hover:bg-accent/70 active:bg-transparent data-[active=true]:bg-transparent data-[active=true]:text-brand"
                    >
                      <Link href={href}>
                        {isPlanner ? (
                          <ProgressRing
                            progress={totalToday > 0 ? doneToday / totalToday : 0}
                            size={16}
                            strokeWidth={2.2}
                          />
                        ) : (
                          <Icon
                            className={
                              active ? "text-brand" : "text-muted-foreground"
                            }
                          />
                        )}
                        <span className={active ? "font-semibold" : ""}>
                          {label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-3">
        <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
          <SidebarTrigger className="rounded-lg text-muted-foreground hover:text-foreground" />
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
