"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { minutage } from "@/features/journal/voix";
import { palette, peindreHalo } from "@/features/journal/halo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Le récit, en trois temps : la lumière monte du bord, elle atteint son
 * niveau, la pilule se pose. Puis l'inverse, plus vite.
 *
 * Le HÉROS est le halo — c'est lui qui dit « on écoute ». Il a donc le plus
 * grand déplacement et la plus longue durée ; les commandes sont secondaires
 * et plus discrètes en tout. Les deux viennent du BAS, la même origine : des
 * directions mêlées feraient du désordre là où il n'y a qu'un événement.
 *
 * À la sortie l'ordre s'inverse — la pilule part d'abord, la lumière s'éteint
 * en dernier, comme une lampe qu'on baisse. Et la sortie est plus courte que
 * l'entrée : on se soucie de ce qui arrive, pas de ce qui s'en va.
 */
const ENTREE_MS = 620;
const SORTIE_MS = 400;

interface BandeEnregistrementProps {
  /** L'instant du départ, pour compter le temps écoulé. */
  depart: number;
  /** S'abonner aux niveaux mesurés par la session en cours. */
  abonner: (surNiveau: (niveau: number) => void) => void;
  /** L'enregistrement est fini : jouer la sortie, puis appeler `onParti`. */
  partant: boolean;
  /** La sortie est jouée — la page peut démonter. */
  onParti: () => void;
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
  partant,
  onParti,
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

  // L'horloge de l'apparition. `partant` la retourne : on garde l'ouverture
  // atteinte au moment du basculement, pour que la sortie reparte d'où
  // l'entrée en était — même si on arrête avant qu'elle soit finie.
  const neRef = useRef(0);
  const sortieRef = useRef<{ debut: number; depuis: number } | null>(null);
  const partiRef = useRef(false);

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
    neRef.current = performance.now();

    // Décélération : rapide au départ, posée à l'arrivée. C'est la courbe
    // d'une chose qui ARRIVE.
    const sortant = (u: number) => 1 - (1 - u) ** 3;
    // Accélération, pour ce qui s'en va.
    const entrant = (u: number) => u ** 3;

    const peindre = (t: number) => {
      if (!vivant) return;

      let ouverture: number;
      if (calme.matches) {
        ouverture = sortieRef.current ? 0 : 1;
      } else if (sortieRef.current) {
        const u = Math.min(1, (t - sortieRef.current.debut) / SORTIE_MS);
        ouverture = sortieRef.current.depuis * (1 - entrant(u));
      } else {
        ouverture = sortant(Math.min(1, (t - neRef.current) / ENTREE_MS));
      }

      // La lueur suit la voix même quand on demande moins de mouvement : sa
      // HAUTEUR est une information, pas un ornement. Ce qu'on immobilise,
      // c'est la dérive des nappes les unes sur les autres.
      const temps = calme.matches ? 0 : t / 1000;
      peindreHalo(toile, palette(), temps, niveauRef.current, ouverture);

      if (sortieRef.current && ouverture <= 0.001 && !partiRef.current) {
        partiRef.current = true;
        onParti();
        return;
      }
      image = requestAnimationFrame(peindre);
    };
    image = requestAnimationFrame(peindre);

    return () => {
      vivant = false;
      cancelAnimationFrame(image);
    };
  }, [monte, onParti]);

  // Le basculement vers la sortie : on note d'où elle part.
  useEffect(() => {
    if (!partant || sortieRef.current) return;
    const t = performance.now();
    const dejaOuvert = Math.min(1, (t - neRef.current) / ENTREE_MS);
    sortieRef.current = { debut: t, depuis: 1 - (1 - dejaOuvert) ** 3 };
  }, [partant]);

  useEffect(() => {
    // Le compte se rafraîchit cinq fois par seconde pour rester juste à la
    // seconde près, sans faire battre la page vingt fois.
    if (partant) return;
    const horloge = setInterval(() => setDepuis(performance.now() - depart), 200);
    return () => clearInterval(horloge);
  }, [depart, partant]);

  if (!monte) return null;

  return createPortal(
    <div className="journal-ecoute" role="group" aria-label="Enregistrement en cours">
      <canvas ref={toileRef} className="journal-ecoute-lueur" aria-hidden />
      {/* Les commandes flottent AU-DESSUS de la lueur, au centre : c'est là
          qu'on les cherche quand tout le bas de l'écran s'allume. Elles sont
          le seul élément de l'ensemble qui prenne le clic. */}
      <div className="journal-ecoute-commandes" data-partant={partant || undefined}>
        {/* Le point rouge, seul écart à l'accent unique de l'app : c'est la
            convention de l'enregistrement, et personne ne la lit deux fois. */}
        <span className="journal-ecoute-point" aria-hidden />
        <span className="journal-ecoute-duree">{minutage(depuis)}</span>
        {/* Au-DESSUS : la pilule est posée au bas de l'écran, une infobulle
            dessous sortirait de la fenêtre. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Abandonner l'enregistrement"
              disabled={partant}
              onClick={onAbandonner}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            Abandonner — rien ne sera gardé
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              aria-label="Terminer l'enregistrement"
              disabled={partant}
              onClick={onTerminer}
            >
              <Check />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            Terminer et poser la note
          </TooltipContent>
        </Tooltip>
      </div>
    </div>,
    document.body,
  );
}
