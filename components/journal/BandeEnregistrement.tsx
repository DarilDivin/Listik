"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { VoiceBeam } from "voice-glow";
import { minutage } from "@/features/journal/voix";
import { teintesVoix } from "@/features/journal/teintes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * La sortie dure au plus ce temps. La lueur annonce elle-même la fin de son
 * fondu (`onDeactivate`) ; ce délai n'est qu'un filet, pour que la page ne
 * reste jamais suspendue à un signal qui ne viendrait pas.
 */
const SORTIE_MAX_MS = 1200;

interface BandeEnregistrementProps {
  /** L'instant du départ, pour compter le temps écoulé. */
  depart: number;
  /** Le flux du micro de la session : la lueur l'écoute elle-même. */
  flux: MediaStream | null;
  /** L'enregistrement est fini : jouer la sortie, puis appeler `onParti`. */
  partant: boolean;
  /** La sortie est jouée — la page peut démonter. */
  onParti: () => void;
  onTerminer: () => void;
  onAbandonner: () => void;
}

/** L'accent (`--brand`, en oklch) résolu en octets, en le peignant sur un pixel. */
function lireAccent(): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [42, 139, 148];
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#2a8b94";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** L'accent et le thème, relus quand ils changent (tous deux sur <html>). */
function useAccentEtTheme() {
  const [etat, setEtat] = useState<{ accent: [number, number, number]; sombre: boolean } | null>(null);
  useEffect(() => {
    const relire = () =>
      setEtat({ accent: lireAccent(), sombre: document.documentElement.classList.contains("dark") });
    relire();
    const observateur = new MutationObserver(relire);
    observateur.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent", "data-oled"],
    });
    return () => observateur.disconnect();
  }, []);
  return etat;
}

/**
 * Ce qui se passe pendant qu'on parle : une pastille flotte au bas de la
 * page — le temps écoulé, abandonner, terminer — et la voix l'éclaire DE
 * L'INTÉRIEUR. La page ne bouge pas d'un pixel, et on peut continuer d'y
 * écrire pendant qu'on parle.
 *
 * La lumière est celle de `voice-glow` (licence MIT, même auteur que les
 * orbes de l'Assistant) : un cœur clair, des franges comme à travers une
 * lentille, un halo qui enfle avec la voix. Elle écoute le flux du micro
 * elle-même — volume, graves, médiums, aigus — et respire doucement dans les
 * silences. Ses couleurs viennent de l'accent (voir `teintes.ts`).
 *
 * Elle remplace l'« aurore » qu'on avait peinte nous-mêmes sur toute la
 * largeur du bas de la fenêtre. On a d'abord tenté de garder cette idée avec
 * la bibliothèque : elle est dessinée pour éclairer un OBJET (une pastille,
 * un champ), et étirée sur toute une fenêtre elle donnait des bords coupés
 * net et une arche lourde. Dans la pastille, c'est le rendu de sa démo.
 *
 * Elle passe par un PORTAIL vers `document.body` : ainsi elle ne dépend
 * d'aucun ancêtre — un `transform` ou un `filter` posé un jour sur le shell
 * piègerait un `position: fixed` et la recollerait au milieu de la page.
 *
 * Elle ne PILOTE rien : le micro s'ouvre dans la page, au clic. Le faire ici,
 * au montage, ouvrait DEUX micros — React monte, démonte et remonte les effets
 * en développement, et le second `getUserMedia` sur un appareil déjà pris rend
 * un flux muet. Elle ne fait donc que MONTRER le flux qu'on lui tend.
 */
export function BandeEnregistrement({
  depart,
  flux,
  partant,
  onParti,
  onTerminer,
  onAbandonner,
}: BandeEnregistrementProps) {
  const [depuis, setDepuis] = useState(0);
  // `document` n'existe pas au prérendu de l'export statique.
  const [monte, setMonte] = useState(false);
  const partiRef = useRef(false);
  const onPartiRef = useRef(onParti);
  onPartiRef.current = onParti;
  const ambiance = useAccentEtTheme();
  const teintes = useMemo(
    () => (ambiance ? teintesVoix(ambiance.accent, ambiance.sombre) : null),
    [ambiance],
  );

  useEffect(() => setMonte(true), []);

  /** Une seule fois, que le signal vienne de la lueur ou du filet. */
  const partir = useRef(() => {
    if (partiRef.current) return;
    partiRef.current = true;
    onPartiRef.current();
  }).current;

  // Le filet de la sortie (voir `SORTIE_MAX_MS`).
  useEffect(() => {
    if (!partant) return;
    const filet = setTimeout(partir, SORTIE_MAX_MS);
    return () => clearTimeout(filet);
  }, [partant, partir]);

  useEffect(() => {
    // Le compte se rafraîchit cinq fois par seconde pour rester juste à la
    // seconde près, sans faire battre la page vingt fois.
    if (partant) return;
    const horloge = setInterval(() => setDepuis(performance.now() - depart), 200);
    return () => clearInterval(horloge);
  }, [depart, partant]);

  if (!monte) return null;

  return createPortal(
    <div
      className="journal-ecoute"
      role="group"
      aria-label="Enregistrement en cours"
      data-partant={partant || undefined}
    >
      {/* `active` à faux joue le fondu de la lumière, qui annonce sa fin par
          `onDeactivate` : c'est le signal que la page peut démonter. */}
      <VoiceBeam
        type="pill"
        stream={flux ?? undefined}
        active={!partant}
        onDeactivate={partir}
        theme={ambiance?.sombre ? "dark" : "light"}
        colors={teintes?.lobes}
        bandColors={teintes?.bande}
        hueRange={10}
      >
        <div className="journal-ecoute-pastille">
          {/* Le point rouge, seul écart à l'accent unique de l'app : c'est la
              convention de l'enregistrement, et personne ne la lit deux fois. */}
          <span className="journal-ecoute-point" aria-hidden />
          <span className="journal-ecoute-duree">{minutage(depuis)}</span>
          {/* Au-DESSUS : la pastille est posée au bas de l'écran, une
              infobulle dessous sortirait de la fenêtre. */}
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
      </VoiceBeam>
    </div>,
    document.body,
  );
}
