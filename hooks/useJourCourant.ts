"use client";

import { useEffect, useState } from "react";
import { lendemainISO, msAvantMinuit, todayLocalISODate } from "@/lib/date";

/**
 * Le jour courant ET le lendemain, qui changent à minuit.
 *
 * Listik reste ouvert des jours entiers : calculé une fois au montage,
 * « demain » devenait aujourd'hui, puis hier. Un minuteur réveille la page à
 * minuit ; le retour au premier plan revérifie aussi (une machine en veille
 * ne réveille pas les minuteurs à l'heure).
 */
export function useJourCourant(): { aujourdhui: string; demain: string } {
  const [aujourdhui, setAujourdhui] = useState(todayLocalISODate);

  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout>;
    const relire = () => setAujourdhui(todayLocalISODate());
    const armer = () => {
      minuteur = setTimeout(() => {
        relire();
        armer();
      }, msAvantMinuit(new Date()) + 1_000);
    };
    armer();
    window.addEventListener("focus", relire);
    document.addEventListener("visibilitychange", relire);
    return () => {
      clearTimeout(minuteur);
      window.removeEventListener("focus", relire);
      document.removeEventListener("visibilitychange", relire);
    };
  }, []);

  return { aujourdhui, demain: lendemainISO(aujourdhui) };
}
