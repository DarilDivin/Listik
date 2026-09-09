"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { minutage } from "@/features/journal/voix";
import { Button } from "@/components/ui/button";

/** Ce que la bande montre du présent : environ trois secondes de voix. */
const FENETRE = 64;

interface BandeEnregistrementProps {
  /** L'instant du départ, pour compter le temps écoulé. */
  depart: number;
  /** S'abonner aux niveaux mesurés par la session en cours. */
  abonner: (surNiveau: (niveau: number) => void) => void;
  onTerminer: () => void;
  onAbandonner: () => void;
}

/**
 * La bande qui bouge pendant qu'on parle.
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
 */
export function BandeEnregistrement({
  depart,
  abonner,
  onTerminer,
  onAbandonner,
}: BandeEnregistrementProps) {
  const [niveaux, setNiveaux] = useState<number[]>(() => Array(FENETRE).fill(0));
  const [depuis, setDepuis] = useState(0);

  useEffect(() => {
    abonner((niveau) => setNiveaux((precedents) => [...precedents.slice(1), niveau]));
  }, [abonner]);

  useEffect(() => {
    // Le compte se rafraîchit cinq fois par seconde pour rester juste à la
    // seconde près, sans faire battre la page vingt fois.
    const horloge = setInterval(() => setDepuis(performance.now() - depart), 200);
    return () => clearInterval(horloge);
  }, [depart]);

  return (
    <div className="journal-bande" role="group" aria-label="Enregistrement en cours">
      {/* Le point rouge, seul écart à l'accent unique de l'app : c'est la
          convention de l'enregistrement, et personne ne la lit deux fois. */}
      <span className="journal-bande-point" aria-hidden />
      <span className="journal-bande-onde" aria-hidden>
        {niveaux.map((niveau, i) => (
          <span
            key={i}
            // Le niveau brut, non normalisé : ici on montre ce que le micro
            // ENTEND, à l'instant. La normalisation est l'affaire de la
            // silhouette gardée, une fois qu'on connaît le plus fort.
            style={{ height: `${Math.max(8, Math.min(1, niveau * 1.6) * 100)}%` }}
          />
        ))}
      </span>
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
  );
}
