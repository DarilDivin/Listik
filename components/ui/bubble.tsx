// Bulle de conversation du template shadcn/chatbot, adaptée à Listik :
// - le `render`/`useRender` de Base UI est retiré (le contenu est toujours un
//   `div` ici, l'indirection Slot n'achèterait rien) ;
// - la table de variantes est ramenée à deux entrées. Celles du template
//   peignent avec `--primary` et des `oklch(from …)` en dur, ce que le design
//   system interdit (§2.1/§2.2) : toute couleur vive passe par `--brand`.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

const bubbleVariants = cva(
  "group/bubble relative flex w-fit max-w-[85%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=ghost]:max-w-full",
  {
    variants: {
      variant: {
        /** Question de l'utilisateur : lavis de l'accent choisi. */
        brand:
          "*:data-[slot=bubble-content]:bg-brand-soft *:data-[slot=bubble-content]:text-foreground",
        /** Réponse de l'agent : posée sur le canvas, sans surface (§2.5). */
        ghost:
          "*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0",
      },
    },
    defaultVariants: {
      variant: "brand",
    },
  },
);

function Bubble({
  variant = "brand",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    align?: "start" | "end";
  }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  );
}

function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        "w-fit max-w-full min-w-0 overflow-hidden rounded-2xl px-4 py-2.5 text-[15px] leading-snug wrap-break-word group-data-[align=end]/bubble:self-end",
        className,
      )}
      {...props}
    />
  );
}

export { BubbleGroup, Bubble, BubbleContent };
