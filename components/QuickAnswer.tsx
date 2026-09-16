"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { ChatMessage } from "@/components/assistant/ChatMessage";
import type { Turn } from "@/features/assistant/conversation";
import { cn } from "@/lib/utils";

interface QuickAnswerProps {
  turns: Turn[];
  pending: boolean;
  onFollowUp: (text: string) => void;
  /** Icône de tête déjà construite par `app/quick/page.tsx` (même chemin de retour que les trois barres). */
  leading: React.ReactNode;
  onOpenInAssistant: () => void;
}

/**
 * La petite fenêtre réponse (mode Question, `app/quick/page.tsx`) — plus
 * étroite que la barre : on y LIT, on n'y écrit plus en continu
 * (docs/ROADMAP-BARRES.md, étape 4, troisième sous-étape). Réutilise
 * `ChatMessage` tel quel (même rendu question-en-bulle/réponse-à-plat que la
 * page Assistant complète) plutôt que d'en refaire un rendu séparé.
 *
 * Une relance NE redéclenche PAS la bulle de réflexion — seule la toute
 * première question fait tout le chemin bulle → réponse ; ici, un tour de
 * plus s'ajoute simplement au fil, qui défile à l'intérieur.
 */
export function QuickAnswer({ turns, pending, onFollowUp, leading, onOpenInAssistant }: QuickAnswerProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (!pending) inputRef.current?.focus();
  }, [pending]);

  const submit = () => {
    const text = inputRef.current?.value.trim();
    if (!text || pending || !inputRef.current) return;
    inputRef.current.value = "";
    onFollowUp(text);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 p-2">
        {leading}
        <span className="ml-auto" />
        <button
          type="button"
          onClick={onOpenInAssistant}
          title="Ouvrir dans l'Assistant"
          aria-label="Ouvrir dans l'Assistant"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </button>
      </div>

      <div ref={transcriptRef} className="max-h-[220px] overflow-y-auto px-3 pb-1">
        <div className="flex flex-col gap-4">
          {turns.map((turn, i) => (
            <ChatMessage key={turn.id} turn={turn} pending={pending && i === turns.length - 1} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Poser une autre question…"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground",
            "disabled:opacity-50",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-label="Envoyer"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition disabled:opacity-35"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
