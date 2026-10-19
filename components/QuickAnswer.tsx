"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown01Icon, ExternalLinkIcon } from "@hugeicons/core-free-icons";
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
}

/**
 * La conversation rapide (mode Question, `app/quick/page.tsx`), construite
 * comme Spotlight : le CHAMP reste en haut, à sa place de barre, et la
 * conversation se déplie DESSOUS. La fenêtre grandit vers le bas pour la
 * contenir, jusqu'à une hauteur au-delà de laquelle c'est le fil qui défile.
 *
 * Le champ est la même barre que l'Assistant complet : une relance s'y tape
 * comme la première question. Elle NE redéclenche PAS la présence de
 * réflexion — seule la toute première question l'affiche, dans la barre ;
 * ici, un tour de plus s'ajoute au fil.
 */
export function QuickAnswer({
  turns,
  pending,
  onFollowUp,
  leading,
  onOpenInAssistant,
}: QuickAnswerProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="flex w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 pr-2.5">
        <div className="h-full min-w-0 flex-1">
          <BarreAssistant
            onSubmit={onFollowUp}
            busy={pending}
            autoFocus={!pending}
            leading={leading}
            placeholder="Relancer, préciser…"
            variant="inline"
          />
        </div>
        <button
          type="button"
          onClick={onOpenInAssistant}
          title="Ouvrir dans l'Assistant"
          aria-label="Ouvrir dans l'Assistant"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <AppIcon icon={ExternalLinkIcon} size={16} />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative border-t border-border/60"
      >
        <div
          ref={transcriptRef}
          onScroll={readScrollPosition}
          className="max-h-[30rem] overflow-y-auto px-4 py-4"
        >
          <div className="flex flex-col gap-5">
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
      </motion.div>
    </div>
  );
}
