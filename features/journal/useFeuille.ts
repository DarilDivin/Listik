"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useJournal } from "@/hooks/useJournal";
import { todayLocalISODate } from "@/lib/date";
import { entreesASupprimer, estVide, type EtatFeuille, type Segment } from "./feuille";
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
  const { entries, upcoming, loading, appendEntry, saveEntry, deleteIfUnchanged, refetchDay } =
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

  /**
   * UNE HORLOGE, parce que le temps passe sans que rien ne re-rende.
   *
   * `ouverte` se calcule pendant le rendu, à partir de `Date.now()` — mais
   * rien ne provoque de rendu quand une heure s'écoule. Une feuille laissée
   * ouverte ne voyait donc JAMAIS sa session se fermer : on revenait deux
   * heures plus tard, on écrivait, et la phrase rejoignait le moment d'avant
   * au lieu d'en ouvrir un nouveau. Le journal perdait ses heures.
   *
   * `revalidateOnFocus` ne suffisait pas : SWR ne re-rend pas quand la
   * revalidation ramène les mêmes données, et c'est le cas normal.
   *
   * Trente secondes : la frontière se voit passer à la demi-minute près, pour
   * un rendu toutes les trente secondes sur la seule page du jour.
   */
  const [, battement] = useState(0);
  useEffect(() => {
    if (!isToday) return;
    const horloge = setInterval(() => battement((n) => n + 1), 30_000);
    return () => clearInterval(horloge);
  }, [isToday]);

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

  // Le jour de chaque moment vu passer, jours confondus : la feuille du widget
  // et de la barre rapide peut garder des moments d'avant minuit, et un moment
  // disparu se recrée dans SON jour.
  const joursRef = useRef(new Map<string, string>());
  for (const e of entries) joursRef.current.set(e.id, e.target_day);

  // Un moment disparu puis recréé change d'identifiant ; la feuille, elle,
  // garde l'ancien sur son repère jusqu'au prochain chargement.
  const remplacesRef = useRef(new Map<string, string>());

  // Le texte d'un repère vierge a été fondu par Rust dans un moment encore
  // ouvert : la feuille doit retirer ce repère (voir `JournalSheet`, `aFondre`).
  const [aFondre, setAFondre] = useState(0);

  /**
   * La feuille a changé : on écrit ce qui a bougé, reprise par reprise.
   *
   * La feuille peut être PÉRIMÉE — elle ne se recharge pas sous les doigts de
   * quelqu'un qui écrit, et une autre fenêtre a pu écrire entre-temps. On
   * n'écrit donc jamais « le texte de la feuille » à l'aveugle : on envoie
   * aussi sa base (ce qu'elle a chargé ou écrit en dernier pour ce moment), et
   * Rust arbitre contre ce que la base contient vraiment (`db::poser_reprise`).
   * Un moment auquel la feuille n'a pas touché n'est jamais envoyé.
   *
   * Une reprise vidée s'en va — c'est le seul geste de suppression. Un repère
   * disparu (Retour arrière sur la frontière) fait de même : sa ligne part,
   * son texte ayant déjà rejoint celle d'avant. Dans les deux cas, Rust garde
   * le moment s'il a reçu ailleurs du texte que la feuille n'a jamais vu.
   */
  const enregistrer = useCallback(
    async (segments: Segment[], { affichees, bases }: EtatFeuille) => {
      const connues = entriesRef.current;
      const vues = new Set<string>();

      for (const s of segments) {
        if (s.entryId === "") {
          if (estVide(s.markdown)) continue;
          const cree = await track(appendEntry(day, s.markdown));
          if (!cree) continue;
          // RUST ARBITRE, et il peut dire non. S'il a jugé la session d'avant
          // encore ouverte, il a fondu le texte dedans et rend CETTE
          // entrée-là. On le reconnaît au CONTENU (un moment neuf contient
          // exactement le texte envoyé), pas à la liste des entrées connues :
          // celle-ci peut être périmée, et le moment fondu ne pas y figurer.
          const fondu = cree.content !== s.markdown;
          if (fondu && bases.has(cree.id)) {
            // La feuille montre ce moment juste au-dessus : on retire le repère
            // vierge, et son texte le rejoint, comme en base. Sans ça, chaque
            // sauvegarde suivante renvoyait ce texte à fondre : il se répétait.
            bases.set(cree.id, `${bases.get(cree.id)}

${s.markdown}`);
            setHeureVierge(null);
            setAFondre((n) => n + 1);
            continue;
          }
          // Moment neuf — ou moment fondu que la feuille ne montre pas encore :
          // le repère vierge prend son identité, et sa base est ce qu'il
          // montre. Rust retrouvera ce morceau dans le moment pour la suite.
          bases.set(cree.id, s.markdown);
          setAStamper({ id: cree.id, heure: heureDe(cree.written_at) });
          continue;
        }
        const id = remplacesRef.current.get(s.entryId) ?? s.entryId;
        vues.add(s.entryId);
        vues.add(id);
        const base = bases.get(s.entryId);
        // Jamais posé par cette feuille : rien à quoi comparer.
        if (base === undefined) continue;
        // La feuille n'a pas touché à ce moment : ce que la base contient
        // (peut-être plus récent) fait foi.
        if (s.markdown === base) continue;
        if (estVide(s.markdown)) {
          const parti = await track(deleteIfUnchanged(id, base));
          if (parti !== null) bases.set(s.entryId, s.markdown);
          continue;
        }
        const jour = joursRef.current.get(id) ?? day;
        const posee = await track(saveEntry(id, jour, base, s.markdown));
        if (!posee) continue;
        // La base de la feuille, c'est ce qu'elle MONTRE : si Rust a recollé
        // un ajout venu d'ailleurs, il le recollera encore à la prochaine
        // frappe, tant que la feuille ne l'a pas rechargé.
        bases.set(s.entryId, s.markdown);
        if (posee.entree.id !== id) {
          remplacesRef.current.set(s.entryId, posee.entree.id);
          joursRef.current.set(posee.entree.id, posee.entree.target_day);
        }
      }

      // Seulement ce que la feuille a affiché : voir `entreesASupprimer`.
      for (const id of entreesASupprimer(connues, vues, affichees)) {
        const base = bases.get(id) ?? connues.find((e) => e.id === id)?.content ?? "";
        await track(deleteIfUnchanged(id, base));
      }
    },
    [day, track, appendEntry, saveEntry, deleteIfUnchanged],
  );

  return {
    entries,
    upcoming,
    loading,
    reprises,
    aStamper,
    aFondre,
    enregistrer,
    saving,
    isToday,
    /** Relit la journée en base (rend une promesse). */
    rafraichir: refetchDay,
  };
}
