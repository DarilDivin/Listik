"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { listen } from "@tauri-apps/api/event";

import BarreAssistant from "@/components/BarreAssistant";
import { AssistantHeader } from "@/components/assistant/AssistantHeader";
import { ChatMessage } from "@/components/assistant/ChatMessage";
import { ScrollToBottomButton } from "@/components/assistant/ScrollToBottomButton";
import { Suggestions } from "@/components/assistant/Suggestions";
import { useConversationScroll } from "@/components/assistant/useConversationScroll";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  buildHistory,
  QUICK_OPEN_ASSISTANT_EVENT,
  type QuickHandoff,
  type Turn,
} from "@/features/assistant/conversation";
import { aiAgent } from "@/features/omnibar/agent";
import { spring } from "@/lib/motion";
import { AppIcon } from "@/components/ui/app-icon";

/**
 * Page Assistant, bâtie sur la charpente du template shadcn/chatbot : en-tête
 * (titre, agent, nouvelle conversation) → fil de messages ancré → barre de
 * saisie en pied, avec l'état vide en `Empty` + amorces.
 *
 * Ce qui reste à nous, et pourquoi : la saisie est la **`BarreAssistant`**
 * (voir docs/ROADMAP-BARRES.md, étape 2 — le `PromptForm` du template ne
 * sait qu'envoyer du texte, sans état occupé propre au design system), le
 * modèle de données est le **tour** question+réponse (voir
 * `features/assistant/conversation.ts`), et la couleur/le mouvement suivent
 * le design system plutôt que le thème du registre. Créer une tâche ou une
 * note reste possible en langage naturel — c'est l'agent qui s'en charge
 * (function-calling MCP), pas un raccourci `/` de la barre.
 */
export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [focusSignal, setFocusSignal] = useState<number>();
  // Garde de réentrance. `pending` est figé dans la closure de la soumission
  // en cours : c'est une ref qu'il faut pour refuser une deuxième question
  // pendant l'appel — deux appels en vol calculeraient leur historique sur le
  // même `turns` périmé, et le second oublierait le premier échange.
  const pendingRef = useRef(false);
  const { viewportRef, anchorRef, atBottom, viewportHeight, anchorLatest, scrollToBottom } =
    useConversationScroll();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("listik-assistant-turns");
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch { localStorage.removeItem("listik-assistant-turns"); }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) localStorage.setItem("listik-assistant-turns", JSON.stringify(turns));
  }, [restored, turns]);

  // La fenêtre rapide transmet sa DERNIÈRE question/réponse en ouvrant cette
  // page (bouton « Ouvrir dans l'Assistant » du panneau réponse) — pas toute
  // la conversation, qui ne persiste nulle part aujourd'hui. On la pose
  // comme premier tour ; si une conversation était déjà en cours ici, elle
  // s'ajoute à la suite plutôt que de l'effacer.
  useEffect(() => {
    const unlisten = listen<QuickHandoff>(QUICK_OPEN_ASSISTANT_EVENT, (event) => {
      const { question, answer } = event.payload;
      setTurns((prev) => [...prev, { id: crypto.randomUUID(), question, answer }]);
      anchorLatest();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAsk = async (text: string) => {
    const id = crypto.randomUUID();
    const history = buildHistory(turns); // avant d'ajouter le tour en cours
    setTurns((prev) => [...prev, { id, question: text }]);
    setPending(true);
    anchorLatest();
    try {
      // Le CLI exécute lui-même les mutations via le serveur MCP local (les
      // mêmes événements todos:changed/journal:changed que l'UI manuelle
      // en ressortent, donc les listes se revalident toutes seules) — rien
      // à rejouer côté frontend, contrairement à l'ancien circuit sidecar.
      const res = await aiAgent(text, history);

      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, answer: res.message } : t)));
    } catch (e) {
      console.error("ai_agent_claude:", e);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                error: true,
                answer: e instanceof Error ? e.message : "L’assistant est indisponible.",
              }
            : t,
        ),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  /**
   * Rendu sans attendre la réponse : l'Omnibar vide son champ quand cette
   * promesse retombe, et la question doit quitter la barre à l'instant où
   * elle paraît dans le fil — pas dix secondes plus tard, quand le CLI
   * répond. (Le template shadcn a le même contrat : `sendMessage` puis
   * `setInput("")`, sans attente.)
   */
  const handleAsk = (text: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    void runAsk(text);
  };

  // Une amorce est une proposition de formulation, pas une action implicite.
  // Le compositeur persistant reçoit le texte et le focus ; l'envoi reste une
  // décision explicite de la personne.
  const handleSuggestion = (text: string) => {
    setDraft(text);
    setFocusSignal((current) => (current ?? 0) + 1);
  };

  const resetConversation = () => {
    if (pendingRef.current) return;
    setTurns([]);
    localStorage.removeItem("listik-assistant-turns");
    setDraft("");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[460px]"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -6%, var(--brand-soft), transparent 70%)",
        }}
      />

      <div className="relative z-10 shrink-0">
        <AssistantHeader
          onNewConversation={resetConversation}
          canReset={turns.length > 0 && !pending}
          busy={pending}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div ref={viewportRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-[44rem] flex-col px-8 pt-6 pb-8">
            {turns.length === 0 ? (
              <EmptyAssistant onSelectSuggestion={handleSuggestion} />
            ) : (
              <div className="flex flex-col gap-8">
                {turns.map((turn, i) => {
                  const isLast = i === turns.length - 1;
                  return (
                    <div
                      key={turn.id}
                      ref={isLast ? anchorRef : undefined}
                      className="scroll-mt-6"
                      // Le dernier tour occupe au moins un écran : sans quoi
                      // il ne pourrait pas monter en haut du cadre et la
                      // réponse s'écrirait toujours en bas (voir le hook).
                      style={
                        isLast && viewportHeight
                          ? { minHeight: viewportHeight - 24 }
                          : undefined
                      }
                    >
                      <ChatMessage turn={turn} pending={pending && isLast} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ScrollToBottomButton
          show={turns.length > 0 && !atBottom}
          onClick={scrollToBottom}
        />
      </div>

      <div className="relative z-10 shrink-0 bg-background/90 backdrop-blur-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto max-w-[44rem] px-8 py-4">
          <BarreAssistant
            onSubmit={handleAsk}
            busy={pending}
            value={draft}
            onValueChange={setDraft}
            focusSignal={focusSignal}
            placeholder="Demander, créer, chercher…"
          />
        </div>
      </div>
    </div>
  );
}

function EmptyAssistant({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="flex flex-1 flex-col"
    >
      <Empty className="gap-5 border-0 p-0 md:p-0">
        <EmptyHeader>
          <EmptyMedia>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring.bouncy, delay: 0.08 }}
              className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"
            >
              <AppIcon icon={AiBrain01Icon} size={26} />
            </motion.div>
          </EmptyMedia>
          <EmptyTitle className="text-large-title text-foreground">
            Que puis-je faire pour vous ?
          </EmptyTitle>
          <EmptyDescription>
            Demandez en langage naturel : créer une tâche, prendre une note, ou poser une
            question sur vos tâches et vos notes.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-lg">
          <Suggestions onSelect={onSelectSuggestion} />
        </EmptyContent>
      </Empty>
    </motion.div>
  );
}
