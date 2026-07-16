"use client";

import { AnimatedTodoList } from "@/components/todo/AnimatedTodoList";
import { HorizonList } from "@/components/planner/section-styles/HorizonList";
import { ZoomList } from "@/components/planner/section-styles/ZoomList";
import { StrataList } from "@/components/planner/section-styles/StrataList";
import { LoupeList } from "@/components/planner/section-styles/LoupeList";
import type { SectionStyleProps } from "@/components/planner/section-styles/types";
import type { SectionStyleId } from "@/components/ui-prefs";

interface SectionBodyProps extends SectionStyleProps {
  style: SectionStyleId;
}

/**
 * Route vers le renderer correspondant au style choisi pour la section.
 * « portail » ne change pas le corps (géré au niveau de la page/SectionCard) :
 * il retombe sur la liste classique tant que la section n'est pas ouverte en
 * plein cadre.
 */
export function SectionBody({ style, ...props }: SectionBodyProps) {
  switch (style) {
    case "horizon":
      return <HorizonList {...props} />;
    case "zoom":
      return <ZoomList {...props} />;
    case "strata":
      return <StrataList {...props} />;
    case "loupe":
      return <LoupeList {...props} />;
    case "list":
    case "portal":
    default:
      return (
        <AnimatedTodoList
          todos={props.todos}
          onToggle={props.onToggle}
          onDelete={props.onDelete}
          showDate={props.showDate ?? true}
          overdue={props.overdue}
          lists={props.lists}
          onUpdate={props.onUpdate}
        />
      );
  }
}
