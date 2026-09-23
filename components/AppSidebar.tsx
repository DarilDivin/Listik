"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { motion } from "motion/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { AppIcon } from "@/components/ui/app-icon";
import { useShortcut } from "@/lib/keys";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { APP_NAV, isNavActive } from "@/components/app-nav";
import { useSidebarSlot } from "@/components/sidebar-slot";
import { todosApi } from "@/features/todos/api";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate } from "@/lib/date";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onOpenSearch?: () => void;
}

/**
 * Sidebar (option de navigation « classique », choisie dans Réglages →
 * Personnalisation). Fond canvas sans bordure dure, items très arrondis,
 * pastille active en lavis d'accent qui glisse (layoutId). Repliable en rail
 * d'icônes (Ctrl+B). Ancrée en `absolute` : elle vit SOUS la TitleBar.
 *
 * « Un seul meuble, deux étages » : quand la page courante fournit un contenu
 * latéral (`SidebarSlot` — le rail du Planificateur), le CORPS de la sidebar
 * le loge et la nav d'app se replie en rangée d'icônes compacte au PIED. La
 * pastille active partage son `layoutId` entre les deux étages : elle vole de
 * la rangée pleine vers l'icône de pied au fil des navigations. La recherche
 * remonte alors dans le header, à côté du titre.
 *
 * L'icône « Planificateur » est le seul signal vivant : un `ProgressRing`
 * miniature qui se remplit avec la progression du jour — repris de `HeroDay`,
 * pas un décor ajouté.
 */
export function AppSidebar({ onOpenSearch }: AppSidebarProps) {
  const pathname = usePathname() ?? "/";
  const { hasContent, setContainer } = useSidebarSlot();
  const searchShortcut = useShortcut("K");

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

  const tooltipFor = (href: string, label: string) =>
    href === "/" && totalToday > 0
      ? `${label} · ${doneToday}/${totalToday} aujourd'hui`
      : label;

  return (
    <Sidebar collapsible="icon" className="absolute h-full !border-r-0">
      <SidebarHeader className="pt-4">
        <div className="flex h-8 items-center justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-lg font-bold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
            Listik
          </span>
          <span className="hidden size-7 rounded-lg bg-brand-soft text-sm font-bold text-brand group-data-[collapsible=icon]:grid group-data-[collapsible=icon]:place-items-center">
            L
          </span>
          {hasContent && onOpenSearch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenSearch}
                  aria-label="Rechercher (Ctrl K)"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground group-data-[collapsible=icon]:hidden"
                >
                  <AppIcon icon={Search01Icon} size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Rechercher · Ctrl K</TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {hasContent ? (
          // Corps prêté à la page : le rail y est téléporté (SidebarSlot).
          <div ref={setContainer} className="min-h-0 flex-1" />
        ) : (
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
                      <AppIcon icon={Search01Icon} />
                      <span>Rechercher</span>
                      <Kbd className="ml-auto bg-muted text-[10px] text-muted-foreground/70">
                        {searchShortcut}
                      </Kbd>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {APP_NAV.map(({ href, label, icon }) => {
                  const active = isNavActive(pathname, href);
                  const isPlanner = href === "/";
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
                        tooltip={tooltipFor(href, label)}
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
                            <AppIcon
                              icon={icon}
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
        )}
      </SidebarContent>

      <SidebarFooter className="pb-3">
        {hasContent && (
          <div className="flex items-center justify-center gap-1 pb-1 group-data-[collapsible=icon]:flex-col">
            {APP_NAV.map(({ href, label, icon }) => {
              const active = isNavActive(pathname, href);
              const isPlanner = href === "/";
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <span className="relative">
                      {active && (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-xl bg-brand-soft"
                          transition={spring.snappy}
                        />
                      )}
                      <Link
                        href={href}
                        aria-label={label}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative z-10 grid size-9 place-items-center rounded-xl transition-colors",
                          active
                            ? "text-brand"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {isPlanner ? (
                          <ProgressRing
                            progress={totalToday > 0 ? doneToday / totalToday : 0}
                            size={16}
                            strokeWidth={2.2}
                          />
                        ) : (
                          <AppIcon icon={icon} size={17} />
                        )}
                      </Link>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {tooltipFor(href, label)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
          <SidebarTrigger className="rounded-lg text-muted-foreground hover:text-foreground" />
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
