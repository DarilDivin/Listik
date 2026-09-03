"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, X } from "lucide-react";
import { journalApi } from "@/features/journal/api";
import { morceaux, sansMarkdown } from "@/features/journal/extrait";
import { SWR_KEYS } from "@/lib/swr-config";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Assez pour parcourir, pas assez pour noyer. */
const COMBIEN = 60;

interface JournalSearchProps {
  /** Aller à ce jour, et refermer la recherche. */
  onPick: (day: string) => void;
  onClose: () => void;
}

/**
 * Chercher un passage dans tout le journal.
 *
 * Un journal qu'on ne peut pas fouiller ne sert qu'à écrire, jamais à relire.
 * Les résultats sont des PASSAGES, pas des jours : ce qu'on cherche est une
 * phrase, et c'est elle qu'on doit reconnaître avant de cliquer.
 *
 * Le classement est chronologique décroissant, pas par pertinence — on cherche
 * « quand ai-je parlé de ça », et la réponse la plus utile est la plus récente.
 */
export function JournalSearch({ onPick, onClose }: JournalSearchProps) {
  const [saisie, setSaisie] = useState("");
  const [requete, setRequete] = useState("");
  const champRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    champRef.current?.focus();
  }, []);

  // On ne cherche pas à chaque lettre : la frappe est plus rapide que SQLite
  // n'est lent, mais une requête par caractère ferait clignoter la liste.
  useEffect(() => {
    const t = setTimeout(() => setRequete(saisie.trim()), 180);
    return () => clearTimeout(t);
  }, [saisie]);

  const { data: hits, isLoading } = useSWR(
    requete ? SWR_KEYS.JOURNAL_SEARCH(requete) : null,
    () => journalApi.search(requete, COMBIEN),
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Le champ prend la place du premier bloc : on cherche là où on écrit. */}
      <div className="flex items-center gap-3 border-b border-border/60 pb-3">
        <Search size={17} className="shrink-0 text-muted-foreground" />
        <input
          ref={champRef}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Chercher dans le journal…"
          className="min-w-0 flex-1 bg-transparent text-[1.0625rem] leading-[1.78] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={15} />
        </button>
      </div>

      {!requete && (
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground/80">
          Une phrase, un nom, un mot commencé — les accents ne comptent pas.
        </p>
      )}

      {requete && isLoading && !hits && (
        <div className="flex flex-col gap-4">
          {[0.9, 0.6, 0.35].map((o) => (
            <Skeleton key={o} className="h-5 w-full" style={{ opacity: o }} />
          ))}
        </div>
      )}

      {requete && hits?.length === 0 && (
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground/80">
          Rien pour « {requete} ». C&apos;est peut-être à écrire.
        </p>
      )}

      {hits && hits.length > 0 && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {hits.length === COMBIEN ? `${COMBIEN}+ passages` : `${hits.length} passage${hits.length > 1 ? "s" : ""}`}
          </p>
          <ul className="flex flex-col">
            {hits.map((h) => {
              const quand = new Date(h.written_at);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onPick(h.target_day)}
                    className="group/hit -mx-3 flex w-[calc(100%+1.5rem)] flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-baseline gap-2.5">
                      <span className="text-[13px] font-medium text-foreground/70 group-hover/hit:text-foreground">
                        {format(quand, "EEEE d MMMM yyyy", { locale: fr })}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {format(quand, "HH:mm")}
                      </span>
                    </span>
                    <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                      {morceaux(h.extrait).map((m, i) => (
                        <span
                          key={i}
                          className={cn(
                            m.trouve &&
                              "rounded-[3px] bg-brand/15 px-0.5 font-medium text-foreground",
                          )}
                        >
                          {sansMarkdown(m.texte)}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
