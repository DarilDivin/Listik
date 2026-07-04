import type { LucideIcon } from "lucide-react";

interface SectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  phase?: string;
}

/** Section en attente d'implémentation (Notes → Phase C, Assistant → Phase D). */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  phase,
}: SectionPlaceholderProps) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 bg-background px-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-72"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -8%, oklch(0.62 0.10 265 / 0.08), transparent 70%)",
        }}
      />
      <div className="relative z-10 grid size-14 place-items-center rounded-2xl bg-accent/60 text-muted-foreground">
        <Icon size={26} />
      </div>
      <h1 className="relative z-10 text-3xl font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      <p className="relative z-10 max-w-sm text-sm text-muted-foreground">{description}</p>
      {phase && (
        <span className="relative z-10 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {phase}
        </span>
      )}
    </div>
  );
}
