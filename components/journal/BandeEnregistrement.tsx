"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { minutage } from "@/features/journal/voix";
import { palette, peindreHalo } from "@/features/journal/halo";
import { Button } from "@/components/ui/button";

interface BandeEnregistrementProps {
  /** L'instant du départ, pour compter le temps écoulé. */
  depart: number;
  /** S'abonner aux niveaux mesurés par la session en cours. */
  abonner: (surNiveau: (niveau: number) => void) => void;
  onTerminer: () => void;
  onAbandonner: () => void;
}

/**
 * Ce qui se passe pendant qu'on parle : le BAS DE L'APP s'allume.
 *
 * Pas une rangée dans la colonne de texte — une lueur couchée sur toute la
 * largeur, au bord inférieur de la fenêtre, comme si elle appartenait au
 * châssis. C'est la différence entre « le document contient un enregistreur »
 * et « l'application est en train d'écouter ». La page ne bouge pas d'un
 * pixel, et on peut continuer d'y écrire pendant qu'on parle.
 *
 * Elle passe par un PORTAIL vers `document.body` : ainsi elle ne dépend
 * d'aucun ancêtre — un `transform` ou un `filter` posé un jour sur le shell
 * piègerait un `position: fixed` et la recollerait au milieu de la page.
 *
 * Elle ne PILOTE rien : le micro s'ouvre dans la page, au clic. Le faire ici,
 * au montage, ouvrait DEUX micros — React monte, démonte et remonte les effets
 * en développement, et le second `getUserMedia` sur un appareil déjà pris rend
 * un flux muet. La lueur restait plate d'un bout à l'autre, sans erreur pour
 * le dire. Elle ne fait donc que MONTRER, et les niveaux lui arrivent.
 */
export function BandeEnregistrement({
  depart,
  abonner,
  onTerminer,
  onAbandonner,
}: BandeEnregistrementProps) {
  const toileRef = useRef<HTMLCanvasElement>(null);
  // Le niveau ne passe PAS par l'état React : il arrive vingt fois par
  // seconde, et re-rendre la page à cette cadence pour repeindre un canvas
  // serait payer un arbre entier pour quelques pixels.
  const niveauRef = useRef(0);
  const [depuis, setDepuis] = useState(0);
  // `document` n'existe pas au prérendu de l'export statique.
  const [monte, setMonte] = useState(false);

  useEffect(() => setMonte(true), []);

  useEffect(() => {
    abonner((niveau) => {
      niveauRef.current = niveau;
    });
  }, [abonner]);

  useEffect(() => {
    const toile = toileRef.current;
    if (!toile) return;
    const calme = window.matchMedia("(prefers-reduced-motion: reduce)");
    let vivant = true;
    let image = 0;

    const peindre = (t: number) => {
      if (!vivant) return;
      // La lueur suit la voix même quand on demande moins de mouvement : sa
      // HAUTEUR est une information, pas un ornement. Ce qu'on immobilise,
      // c'est la dérive des nappes les unes sur les autres.
      const temps = calme.matches ? 0 : t / 1000;
      peindreHalo(toile, palette(), temps, niveauRef.current);
      image = requestAnimationFrame(peindre);
    };
    image = requestAnimationFrame(peindre);

    return () => {
      vivant = false;
      cancelAnimationFrame(image);
    };
  }, [monte]);

  useEffect(() => {
    // Le compte se rafraîchit cinq fois par seconde pour rester juste à la
    // seconde près, sans faire battre la page vingt fois.
    const horloge = setInterval(() => setDepuis(performance.now() - depart), 200);
    return () => clearInterval(horloge);
  }, [depart]);

  if (!monte) return null;

  return createPortal(
    <div className="journal-ecoute" role="group" aria-label="Enregistrement en cours">
      <canvas ref={toileRef} className="journal-ecoute-lueur" aria-hidden />
      {/* Les commandes flottent AU-DESSUS de la lueur, au centre : c'est là
          qu'on les cherche quand tout le bas de l'écran s'allume. Elles sont
          le seul élément de l'ensemble qui prenne le clic. */}
      <div className="journal-ecoute-commandes">
        {/* Le point rouge, seul écart à l'accent unique de l'app : c'est la
            convention de l'enregistrement, et personne ne la lit deux fois. */}
        <span className="journal-ecoute-point" aria-hidden />
        <span className="journal-ecoute-duree">{minutage(depuis)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Abandonner l'enregistrement"
          title="Abandonner"
          onClick={onAbandonner}
        >
          <X />
        </Button>
        <Button
          size="icon-sm"
          aria-label="Terminer l'enregistrement"
          title="Terminer"
          onClick={onTerminer}
        >
          <Check />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
