"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import Omnibar from "@/components/Omnibar";
import { spring } from "@/lib/motion";
import { usePlannerTodos } from "@/hooks/usePlannerTodos";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { aiAgent, type AiChatMessage } from "@/features/omnibar/agent";
import type { SmartTaskData } from "@/features/todos/useTaskMode";
import { todayLocalISODate } from "@/lib/date";

interface Turn {
  id: string;
  question: string;
  answer?: string;
  error?: boolean;
}

// Un LLM est sans état : on lui renvoie les derniers échanges à chaque appel
// pour qu'il résolve les références au contexte ("et demain ?"). Plafonné
// pour ne pas faire grandir indéfiniment le coût/latence de chaque appel.
const MAX_HISTORY_TURNS = 6;

function buildHistory(turns: Turn[]): AiChatMessage[] {
  return turns
    .filter((t) => t.answer !== undefined && !t.error)
    .slice(-MAX_HISTORY_TURNS)
    .flatMap((t): AiChatMessage[] => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.answer! },
    ]);
}

export default function AssistantPage() {
  const { createTodoFromSmart, lists } = usePlannerTodos();
  const { createEntry: createJournalEntry } = useJournalMutations();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const handleAsk = async (text: string) => {
    const id = crypto.randomUUID();
    const history = buildHistory(turns); // avant d'ajouter le tour en cours
    setTurns((prev) => [...prev, { id, question: text }]);
    setPending(true);
    scrollToBottom();
    try {
      // Le CLI exécute lui-même les mutations via le serveur MCP local (les
      // mêmes événements todos:changed/journal:changed que l'UI manuelle
      // en ressortent, donc les listes se revalident toutes seules) — rien
      // à rejouer côté frontend, contrairement à l'ancien circuit sidecar.
      const res = await aiAgent(text, history);

      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, answer: res.message } : t)),
      );
    } catch (e) {
      console.error("ai_agent_claude:", e);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                error: true,
                answer: "L'assistant est indisponible (CLI introuvable, ou délai dépassé).",
              }
            : t,
        ),
      );
    } finally {
      setPending(false);
      scrollToBottom();
    }
  };

  const handleCreateTodo = async (data: SmartTaskData) => {
    await createTodoFromSmart(data);
    toast.success("Tâche créée");
  };

  // Même repointage que dans le Planificateur et Alt+Q (Phase P) : /note crée
  // un bloc de Journal pour aujourd'hui, pas une note classique.
  const handleCreateNote = async (text: string) => {
    await createJournalEntry({ target_day: todayLocalISODate(), content: text });
    toast.success("Bloc ajouté au Journal");
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

      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[44rem] px-8 pt-16 pb-8">
          {turns.length === 0 ? (
            <EmptyAssistant onAsk={handleAsk} />
          ) : (
            <div className="flex flex-col gap-8">
              {turns.map((turn) => (
                <ConversationTurn key={turn.id} turn={turn} />
              ))}
              {pending && <ThinkingIndicator />}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 shrink-0 bg-background/90 backdrop-blur-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto max-w-[44rem] px-8 py-4">
          <Omnibar
            defaultMode="ask"
            onSubmit={handleCreateTodo}
            onSubmitNote={handleCreateNote}
            onSubmitAsk={handleAsk}
            placeholder="Demander, créer, chercher…"
            lists={lists}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyAssistant({ onAsk }: { onAsk: (text: string) => void }) {
  const examples = [
    "Ajoute appeler le dentiste vendredi",
    "Qu'est-ce que j'ai cette semaine ?",
    "Note : idée d'article sur le RAG",
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="flex flex-col items-center gap-4 pt-16 text-center"
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...spring.bouncy, delay: 0.08 }}
        className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"
      >
        <Sparkles size={26} />
      </motion.div>
      <h1 className="text-large-title text-foreground">Assistant</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Demandez en langage naturel : créer une tâche, prendre une note, ou poser une question sur
        vos tâches et notes.
      </p>
      <div className="mt-2 flex flex-col items-stretch gap-2">
        {examples.map((ex, i) => (
          <motion.button
            key={ex}
            type="button"
            onClick={() => onAsk(ex)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.12 + i * 0.05 }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className="rounded-xl border border-border/60 px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:border-border hover:bg-accent/40 hover:text-foreground"
          >
            {ex}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

function ConversationTurn({ turn }: { turn: Turn }) {
  return (
    <div className="flex flex-col gap-3">
      <motion.p
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.smooth}
        className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-brand-soft px-4 py-2 text-[15px] leading-snug text-foreground"
      >
        {turn.question}
      </motion.p>

      {turn.answer !== undefined && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className="flex flex-col gap-2"
        >
          <div
            className={`note-markdown text-[15px] leading-relaxed ${
              turn.error ? "text-destructive" : "text-foreground"
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="flex items-center gap-1.5 text-muted-foreground"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-current"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}
