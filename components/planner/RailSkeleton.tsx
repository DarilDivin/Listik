import { Skeleton } from "@/components/ui/skeleton";

/**
 * Squelette du rail pendant le chargement — même gabarit (rangées icône +
 * libellé), injecté dans le slot pour que le meuble ne « clignote » pas entre
 * l'arrivée sur la page et les premières données.
 */
export function RailSkeleton() {
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <div className="flex flex-col gap-4 px-2.5 pt-2">
        {[1, 0.8, 0.6, 0.45, 0.3].map((opacity) => (
          <div
            key={opacity}
            className="flex items-center gap-2.5 max-md:justify-center group-data-[collapsible=icon]:justify-center"
            style={{ opacity }}
          >
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 flex-1 max-md:hidden group-data-[collapsible=icon]:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
