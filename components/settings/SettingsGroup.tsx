import type { ReactNode } from "react";

interface SettingsGroupProps {
  title?: string;
  /** Action discrète alignée à droite du titre (ex. « Actualiser »). */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Groupe de réglages posé directement sur la page (pas de carte ni d'ombre) :
 * un titre discret, puis des lignes séparées par des hairlines, fermées en
 * haut et en bas comme une section du Planificateur.
 */
export function SettingsGroup({ title, action, children }: SettingsGroupProps) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-1 flex min-h-7 items-center justify-between gap-3">
          {title && <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>}
          {action}
        </div>
      )}
      <div className="divide-y divide-border/60 border-y border-border/60">{children}</div>
    </section>
  );
}
