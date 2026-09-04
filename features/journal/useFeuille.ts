"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useJournal } from "@/hooks/useJournal";
import { todayLocalISODate } from "@/lib/date";
import { estVide, type Segment } from "./feuille";
import type { Reprise } from "@/components/journal/JournalSheet";

/**
 * Au-delà d'une heure sans écrire, on est REVENU : la phrase suivante ouvre un
 * autre moment de la journée. La même règle vit en Rust (`db::REPRISE`), qui
 * reste l'arbitre — ici elle ne sert qu'à savoir s'il faut montrer un repère
 * vierge au bas de la feuille.
 */
const REPRISE_MS = 60 * 60 * 1000;

export type Saving = "idle" | "saving" | "saved";

/**
 * Tout ce qu'il faut pour tenir une feuille du jour, page comme widget.
 *
 * Ce hook existe pour une raison précise : la page-jour et le widget de
 * l'accueil montrent la MÊME journée. Dupliquer ici le calcul des reprises, la
 * règle du repère vierge et la sauvegarde par segment, c'est se garantir que
 * les deux surfaces divergeront — et c'est exactement la dette qu'on vient de
 * payer sur l'ancien widget.
 */
export function useFeuille(day: string, withUpcoming = true) {
  const { entries, upcoming, loading, appendEntry, updateEntry, deleteEntry } =
    useJournal(day, withUpcoming);

  const [saving, setSaving] = useState<Saving>("idle");
  // L'identité à poser sur le repère encore vierge, une fois sa ligne créée.
  const [aStamper, setAStamper] = useState<{ id: string; heure: string } | null>(
    null,
  );

  /**
   * Enveloppe une mutation pour que l'indicateur d'enregistrement la suive.
   *
   * Ne rejette JAMAIS : tous les appels sont en `void` (on écrit, on n'attend
   * pas), donc re-lever ne ferait qu'un rejet non capturé de plus.
   * `useJournalMutations` a déjà prévenu par un toast — le seul travail qui
   * reste est de rendre l'échec lisible à l'appelant, d'où le `null`.
   */
  const track = useCallback(async <T,>(work: Promise<T>): Promise<T | null> => {
    setSaving("saving");
    try {
      const result = await work;
      setSaving("saved");
      return result;
    } catch {
      setSaving("idle");
      return null;
    }
  }, []);

  const heureDe = (iso: string) => format(new Date(iso), "HH:mm");

  /**
   * La dernière reprise est-elle encore ouverte ? On mesure sur `updated_at`,
   * la dernière écriture RÉELLE — rester une heure et demie sur un même moment
   * ne doit pas le fermer sous les doigts.
   */
  const isToday = day === todayLocalISODate();
  const derniere = entries[entries.length - 1];
  const ouverte =
    derniere !== undefined &&
    Date.now() - new Date(derniere.updated_at).getTime() < REPRISE_MS;

  // L'heure du repère vierge se fige à son apparition : la recalculer à chaque
  // rendu changerait la feuille toutes les minutes, et la rechargerait.
  const [heureVierge, setHeureVierge] = useState<string | null>(null);
  useEffect(() => {
    if (isToday && !ouverte) {
      setHeureVierge((h) => h ?? format(new Date(), "HH:mm"));
    } else {
      setHeureVierge(null);
    }
  }, [isToday, ouverte]);

  const reprises = useMemo<Reprise[]>(() => {
    const posees = entries.map((e) => ({
      id: e.id,
      heure: heureDe(e.written_at),
      markdown: e.content,
    }));
    // « Ici commence maintenant » : une promesse, pas encore une ligne en base.
    if (heureVierge !== null) posees.push({ id: "", heure: heureVierge, markdown: "" });
    return posees;
  }, [entries, heureVierge]);

  // La sauvegarde compare aux entrées SANS se réabonner à chaque frappe.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /**
   * La feuille a changé : on écrit ce qui a bougé, reprise par reprise.
   *
   * Une reprise vidée s'en va — c'est le seul geste de suppression, et il ne
   * demande rien de plus que d'effacer son texte. Un repère disparu (Retour
   * arrière sur la frontière) fait de même : sa ligne part, son texte ayant
   * déjà rejoint celle d'avant.
   */
  const enregistrer = useCallback(
    async (segments: Segment[]) => {
      const connues = entriesRef.current;
      const vues = new Set<string>();

      for (const s of segments) {
        if (s.entryId === "") {
          if (estVide(s.markdown)) continue;
          const cree = await track(appendEntry(day, s.markdown));
          if (cree) setAStamper({ id: cree.id, heure: heureDe(cree.written_at) });
          continue;
        }
        vues.add(s.entryId);
        const avant = connues.find((e) => e.id === s.entryId);
        if (avant === undefined) continue;
        if (estVide(s.markdown)) {
          await track(deleteEntry(s.entryId));
          continue;
        }
        if (s.markdown !== avant.content) {
          await track(updateEntry(s.entryId, { content: s.markdown }));
        }
      }

      for (const e of connues) {
        if (!vues.has(e.id)) await track(deleteEntry(e.id));
      }
    },
    [day, track, appendEntry, updateEntry, deleteEntry],
  );

  return {
    entries,
    upcoming,
    loading,
    reprises,
    aStamper,
    enregistrer,
    saving,
    isToday,
  };
}
