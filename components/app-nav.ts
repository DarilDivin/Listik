import {
  AiBrain01Icon,
  Calendar03Icon,
  Notebook01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface AppNavItem {
  href: string;
  label: string;
  icon: IconSvgElement;
}

/** Les 4 sections de l'app — partagées par la sidebar, le dock et la mini-nav. */
export const APP_NAV: AppNavItem[] = [
  { href: "/", label: "Planificateur", icon: Calendar03Icon },
  { href: "/journal", label: "Journal", icon: Notebook01Icon },
  { href: "/assistant", label: "Assistant", icon: AiBrain01Icon },
  { href: "/settings", label: "Réglages", icon: Settings02Icon },
];

/** Une entrée est active si le chemin courant vit dans sa section. */
export function isNavActive(pathname: string, href: string): boolean {
  const clean = pathname.replace(/\/$/, "") || "/";
  return href === "/" ? clean === "/" : clean.startsWith(href);
}
