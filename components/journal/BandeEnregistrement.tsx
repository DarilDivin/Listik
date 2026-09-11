"use client";

import { useEffect, useRef, useState } from "react";
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
 * La bande qui bouge pendant qu'on parle : un halo qui enfle avec la voix.
 *
 * Elle vit dans la PAGE, hors de l'éditeur, et c'est délibéré. La faire vivre
 * dans le document aurait été plus joli — la bande serait apparue là où était
 * le curseur — mais l'éditeur s'enregistre tout seul toutes les sept dixièmes
 * de seconde : un nœud d'enregistrement s'y serait retrouvé écrit dans le
 * markdown de la journée, pour un objet qui n'existe que le temps qu'on parle
 * et n'a aucune forme en Markdown. Rien ne touche au texte enregistré tant
 * qu'il n'y a pas une vraie pièce à poser.
 *
 * Elle ne PILOTE rien : le micro s'ouvre dans la page, au clic. Le faire ici,
 * au montage, ouvrait DEUX micros — React monte, démonte et remonte les effets
 * en développement, et le second `getUserMedia` sur un appareil déjà pris rend
 * un flux muet. La bande restait plate d'un bout à l'autre, sans erreur pour
 * le dire. Elle ne fait donc que MONTRER, et les niveaux lui arrivent.
 *
 * Elle est plus haute que les autres rangées du journal, et c'est voulu : un
 * halo a besoin d'air, et enregistrer est un MOMENT, pas une ligne de plus
 * dans la page.
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
      // Le halo suit la voix même quand on demande moins de mouvement : sa
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
  }, []);

  useEffect(() => {
    // Le compte se rafraîchit cinq fois par seconde pour rester juste à la
    // seconde près, sans faire battre la page vingt fois.
    const horloge = setInterval(() => setDepuis(performance.now() - depart), 200);
    return () => clearInterval(horloge);
  }, [depart]);

  return (
    <div className="journal-bande" role="group" aria-label="Enregistrement en cours">
      <canvas ref={toileRef} className="journal-bande-halo" aria-hidden />
      <div className="journal-bande-avant">
        {/* Le point rouge, seul écart à l'accent unique de l'app : c'est la
            convention de l'enregistrement, et personne ne la lit deux fois. */}
        <span className="journal-bande-point" aria-hidden />
        <span className="journal-bande-duree">{minutage(depuis)}</span>
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
    </div>
  );
}
