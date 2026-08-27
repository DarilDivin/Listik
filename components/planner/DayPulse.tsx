"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { ProgressRing } from "@/components/planner/ProgressRing";
import { cn } from "@/lib/utils";
import { useUIPrefs, type PulseStyleId } from "@/components/ui-prefs";

interface DayPulseProps {
  done: number;
  total: number;
  /** Part de journée écoulée (0..1), ou `null` hors de la fenêtre 7 h – 23 h. */
  dayProgress: number | null;
}

/** Au-delà, une cellule par tâche devient un trait : on repasse à une jauge. */
const MAX_CELLS = 10;

/**
 * Comparaison entre l'avancée des tâches et celle du temps.
 *
 * Volontairement SANS rouge, alors que « en retard » serait tentant : le rouge
 * est réservé aux priorités et au destructif (§2.3), et surtout un widget qui
 * gronde n'est pas le ton de l'app. C'est la formulation qui porte l'écart, pas
 * la couleur.
 */
function pace(
  done: number,
  total: number,
  dayProgress: number | null,
): { text: string; brand: boolean } | null {
  if (total === 0) return null;
  if (total - done === 0) return { text: "journée bouclée", brand: true };
  if (dayProgress === null) return null;

  const gap = done / total - dayProgress;
  if (gap > 0.1) return { text: "en avance sur la journée", brand: true };
  if (gap < -0.15) return { text: "la journée va plus vite", brand: false };
  return { text: "au rythme du jour", brand: false };
}

function Pace({ done, total, dayProgress }: DayPulseProps) {
  const p = pace(done, total, dayProgress);
  if (!p) return null;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        p.brand ? "text-brand" : "text-muted-foreground",
      )}
    >
      {p.text}
    </span>
  );
}

/** Le compte restant, seul nombre qui appelle une action. */
function Remaining({ done, total }: { done: number; total: number }) {
  return <AnimatedNumber value={total - done} className="tabular-nums" />;
}

// ---------------------------------------------------------------------------

/** A — L'anneau d'origine : chiffre fait / total, point du jour sur le cadran. */
function PulseRing({ done, total, dayProgress }: DayPulseProps) {
  return (
    <div className="flex items-center gap-3">
      <ProgressRing
        progress={total > 0 ? done / total : 0}
        size={40}
        strokeWidth={3}
        // Rien à situer sur le cadran s'il n'y a rien à faire aujourd'hui.
        marker={total > 0 ? dayProgress ?? undefined : undefined}
      />
      <div className="flex flex-col gap-0.5 pr-1">
        <span className="flex items-baseline gap-1 tabular-nums">
          <AnimatedNumber
            value={done}
            className="text-2xl font-semibold text-foreground"
          />
          <span className="text-sm text-muted-foreground/60">/ {total}</span>
        </span>
        <span className="text-xs text-muted-foreground">aujourd&apos;hui</span>
      </div>
    </div>
  );
}

/** B — Le cadran : la piste porte la journée, le centre ce qui reste. */
function PulseDial({ done, total, dayProgress }: DayPulseProps) {
  const remaining = total - done;
  return (
    <div className="flex items-center gap-3">
      <ProgressRing
        progress={total > 0 ? done / total : 0}
        size={52}
        strokeWidth={5}
        dayArc={total > 0 ? dayProgress ?? undefined : undefined}
      >
        <span className="text-base font-semibold tracking-[-0.02em] tabular-nums text-foreground">
          {total === 0 ? "—" : <Remaining done={done} total={total} />}
        </span>
      </ProgressRing>
      <div className="flex flex-col gap-0.5 pr-1">
        <span className="text-[0.8125rem] text-muted-foreground">
          {total === 0
            ? "rien de prévu"
            : remaining === 0
              ? "tout est fait"
              : "à faire"}
        </span>
        <Pace done={done} total={total} dayProgress={dayProgress} />
      </div>
    </div>
  );
}

/** C — La barre : les tâches au-dessus, le temps en dessous. Deux axes, alignés. */
function PulseBar({ done, total, dayProgress }: DayPulseProps) {
  const remaining = total - done;
  // Une cellule par tâche tant qu'on peut les compter d'un regard ; au-delà,
  // une jauge continue — un trait de deux pixels ne se compte pas.
  const cells = total > 0 && total <= MAX_CELLS ? total : 0;

  return (
    <div className="flex min-w-[11.5rem] flex-col gap-2.5 pr-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-semibold tracking-[-0.02em] tabular-nums text-foreground">
          {total === 0 ? "—" : <Remaining done={done} total={total} />}
          {total > 0 && remaining > 0 && (
            <span className="ml-1.5 text-[0.8125rem] font-normal text-muted-foreground">
              à faire
            </span>
          )}
        </span>
        <Pace done={done} total={total} dayProgress={dayProgress} />
      </div>

      <div className="flex flex-col gap-[5px]">
        {cells > 0 ? (
          <div className="flex gap-[3px]">
            {Array.from({ length: cells }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[7px] flex-1 rounded-[2px] transition-colors duration-300",
                  i < done ? "bg-brand" : "bg-foreground/[0.14]",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="h-[7px] overflow-hidden rounded-[2px] bg-foreground/[0.1]">
            <div
              className="h-full rounded-[2px] bg-brand transition-[width] duration-300"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Le temps, sur sa propre ligne : il ne partage pas l'axe des tâches. */}
        <div className="h-[3px] overflow-hidden rounded-[2px] bg-foreground/[0.1]">
          <div
            className="h-full rounded-[2px] bg-muted-foreground/40 transition-[width] duration-300"
            style={{ width: `${(dayProgress ?? 0) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** D — Le compte à rebours : le moins d'objets, le gros chiffre sur ce qui reste. */
function PulseCountdown({ done, total, dayProgress }: DayPulseProps) {
  const remaining = total - done;
  return (
    <div className="flex min-w-[9rem] flex-col items-start gap-1.5 pr-1">
      <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground">
        {total === 0 ? "—" : <Remaining done={done} total={total} />}
      </span>
      <span className="text-[0.8125rem] text-muted-foreground">
        {total === 0
          ? "rien de prévu"
          : remaining === 0
            ? "tout est fait"
            : `à faire, sur ${total}`}
      </span>
      <span className="h-[2px] w-full overflow-hidden rounded-[2px] bg-foreground/[0.1]">
        <span
          className="block h-full rounded-[2px] bg-brand transition-[width] duration-300"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </span>
      <Pace done={done} total={total} dayProgress={dayProgress} />
    </div>
  );
}

const PULSES: Record<PulseStyleId, (props: DayPulseProps) => React.ReactNode> = {
  ring: PulseRing,
  dial: PulseDial,
  bar: PulseBar,
  countdown: PulseCountdown,
};

/**
 * Le pouls du jour : combien il reste à faire, et où en est la journée.
 *
 * Quatre traitements, au choix dans Réglages → Personnalisation. Ils ne
 * diffèrent pas par le goût mais par ce qu'ils mettent au premier plan : ce
 * qui est fait (Anneau), l'écart avec le temps (Cadran), le décompte des
 * tâches (Barre), ou le seul nombre restant (Compte).
 */
export function DayPulse(props: DayPulseProps) {
  const { pulse } = useUIPrefs();
  const Pulse = PULSES[pulse] ?? PulseRing;
  return <Pulse {...props} />;
}
