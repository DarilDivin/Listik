import type { ComponentProps } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type AppIconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon" | "size" | "strokeWidth"> & {
  icon: IconSvgElement;
  size?: number | string;
  strokeWidth?: number;
};

/**
 * Le point d'entrée unique des icônes produit. Les traits restent arrondis et
 * à la même densité, quelle que soit la zone de l'interface qui les emploie.
 */
export function AppIcon({
  icon,
  size = 20,
  strokeWidth = 1.75,
  className,
  ...props
}: AppIconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}
