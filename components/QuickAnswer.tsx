"use client";

import { useEffect, useRef, useState } from "react";
import { AiBrain01Icon, ArrowDown01Icon, ExternalLinkIcon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import BarreAssistant from "@/components/BarreAssistant";
import { ChatMessage } from "@/components/assistant/ChatMessage";
import type { Turn } from "@/features/assistant/conversation";

interface QuickAnswerProps {
  turns: Turn[];
  pending: boolean;
  onFollowUp: (text: string) => void;
  /** Icône de tête déjà construite par `app/quick/page.tsx` (même chemin de retour que les trois barres). */
  leading: React.ReactNode;
  onOpenInAssistant: () => void;
  /** La hauteur dont le panneau aurait besoin pour tout montrer sans défiler.
   *  La page la borne : au-delà, c'est le fil qui défile. */
  onHauteurNaturelle?: (hauteur: number) => void;
}

/**
 * La petite fenêtre réponse (mode Question, `app/quick/page.tsx`) reprend la
 * même barre que l'Assistant complet. La fenêtre rapide est donc une
 * continuité de la conversation, pas un deuxième chat avec son propre champ.
 *
 * Une relance NE redéclenche PAS la bulle de réflexion — seule la toute
 * première question fait tout le chemin bulle → réponse ; ici, un tour de
 * plus s'ajoute simplement au fil, qui défile à l'intérieur.
 */
export function QuickAnswer({
  turns,
  pending,
  onFollowUp,
  leading,
  onOpenInAssistant,
  onHauteurNaturelle,
}: QuickAnswerProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const enteteRef = useRef<HTMLElement>(null);
  const filRef = useRef<HTMLDivElement>(null);
  const piedRef = useRef<HTMLDivElement>(null);
  const followsLatestRef = useRef(true);
  const [showLatestControl, setShowLatestControl] = useState(false);

  const readScrollPosition = () => {
    const el = transcriptRef.current;
    if (!el) return;
    const followsLatest = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    followsLatestRef.current = followsLatest;
    setShowLatestControl(!followsLatest);
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    if (followsLatestRef.current) el.scrollTop = el.scrollHeight;
    readScrollPosition();
  }, [turns]);

  // Le panneau grandit avec la conversation : en-tête + fil (et ses marges)
  // + champ de relance. On mesure le CONTENU du fil, pas sa boîte, qui est
  // bornée par la hauteur que la page lui donne.
  useEffect(() => {
    if (!onHauteurNaturelle) return;
    const elements = [enteteRef.current, filRef.current, piedRef.current];
    if (elements.some((e) => !e)) return;
    const [entete, fil, pied] = elements as HTMLElement[];
    const mesurer = () => {
      const margesDuFil = 24; // py-3
      onHauteurNaturelle(
        Math.ceil(entete.offsetHeight + fil.offsetHeight + margesDuFil + pied.offsetHeight),
      );
    };
    const observateur = new ResizeObserver(mesurer);
    for (const e of elements as HTMLElement[]) observateur.observe(e);
    mesurer();
    return () => observateur.disconnect();
  }, [onHauteurNaturelle]);

  return (
    <div className="relative flex h-full w-full flex-col bg-popover">
      <header ref={enteteRef} className="flex shrink-0 items-center gap-2 px-3 py-3">
        {leading}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none text-foreground">Assistant</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
            <AppIcon icon={AiBrain01Icon} size={13} className="text-brand" />
            Conversation rapide
          </p>
        </div>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={onOpenInAssistant}
          title="Ouvrir dans l'Assistant"
          aria-label="Ouvrir dans l'Assistant"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <AppIcon icon={ExternalLinkIcon} size={16} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={transcriptRef}
          onScroll={readScrollPosition}
          className="h-full overflow-y-auto px-4 py-3"
        >
          <div ref={filRef} className="flex flex-col gap-5">
            {turns.map((turn, i) => (
              <ChatMessage key={turn.id} turn={turn} pending={pending && i === turns.length - 1} />
            ))}
          </div>
        </div>

        {showLatestControl && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.92, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={() => {
              const el = transcriptRef.current;
              if (!el) return;
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label="Revenir au dernier échange"
            className="absolute right-4 bottom-3 z-10 grid size-9 place-items-center rounded-full border border-border/70 bg-popover text-muted-foreground shadow-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <AppIcon icon={ArrowDown01Icon} size={17} />
          </motion.button>
        )}
      </div>

      <motion.div
        ref={piedRef}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 px-3 py-3"
      >
        <BarreAssistant
          onSubmit={onFollowUp}
          busy={pending}
          autoFocus={!pending}
          placeholder="Demander, créer, chercher…"
        />
      </motion.div>
    </div>
  );
}
