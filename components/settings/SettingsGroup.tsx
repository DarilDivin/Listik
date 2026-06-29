import type { ReactNode } from "react";

interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
}

/**
 * Groupe de réglages : libellé en capitales + surface douce translucide
 * (façon iOS, sans cadre dur). Les lignes sont aérées par l'espace.
 */
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <section>
      {title && (
        <h2 className="mb-2 px-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl bg-foreground/[0.03] backdrop-blur-sm">
        {children}
      </div>
    </section>
  );
}
