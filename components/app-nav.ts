import {
  CalendarDays,
  NotebookPen,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface AppNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Les 4 sections de l'app — partagées par la sidebar, le dock et la mini-nav. */
export const APP_NAV: AppNavItem[] = [
  { href: "/", label: "Planificateur", icon: CalendarDays },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/settings", label: "Réglages", icon: Settings },
];

/** Une entrée est active si le chemin courant vit dans sa section. */
export function isNavActive(pathname: string, href: string): boolean {
  const clean = pathname.replace(/\/$/, "") || "/";
  return href === "/" ? clean === "/" : clean.startsWith(href);
}
