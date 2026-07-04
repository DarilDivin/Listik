"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Sparkles, ListTodo, StickyNote } from "lucide-react";
import Omnibar from "@/components/Omnibar";
import { usePlannerTodos } from "@/hooks/usePlannerTodos";
import { useNotesMutations } from "@/features/notes/useNotesMutations";
import { aiAgent, type AiSource } from "@/features/omnibar/agent";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

interface Turn {
  id: string;
  question: string;
  answer?: string;
  tool?: string;
  sources?: AiSource[];
  error?: boolean;
}

const TOOL_LABEL: Record<string, { icon: typeof ListTodo; text: string }> = {
  create_task: { icon: ListTodo, text: "Tâche créée" },
  create_note: { icon: StickyNote, text: "Note enregistrée" },
};

export default function AssistantPage() {
  const { createTodoFromSmart, lists } = usePlannerTodos();
  const { createNote } = useNotesMutations();

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
    setTurns((prev) => [...prev, { id, question: text }]);
    setPending(true);
    scrollToBottom();
    try {
      const res = await aiAgent(text);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, answer: res.message, tool: res.tool, sources: res.sources } : t,
        ),
      );
    } catch (e) {
      console.error("ai_agent:", e);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, error: true, answer: "L'assistant est indisponible (sidecar ou clé API ?)." }
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

  const handleCreateNote = async (text: string) => {
    await createNote({ content: text });
    toast.success("Note créée");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[460px]"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -6%, oklch(0.62 0.10 300 / 0.10), transparent 70%)",
        }}
      />

      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[44rem] px-8 pt-16 pb-8">
          {turns.length === 0 ? (
            <EmptyAssistant />
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

function EmptyAssistant() {
  const examples = [
    "Ajoute appeler le dentiste vendredi",
    "Qu'est-ce que j'ai cette semaine ?",
    "Note : idée d'article sur le RAG",
  ];
  return (
    <div className="flex flex-col items-center gap-4 pt-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-accent/60 text-muted-foreground">
        <Sparkles size={26} />
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground">Assistant</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Demandez en langage naturel : créer une tâche, prendre une note, ou poser une question sur
        vos tâches et notes.
      </p>
      <div className="mt-2 flex flex-col items-stretch gap-2">
        {examples.map((ex) => (
          <span
            key={ex}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-[13px] text-muted-foreground"
          >
            {ex}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConversationTurn({ turn }: { turn: Turn }) {
  const toolMeta = turn.tool ? TOOL_LABEL[turn.tool] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <p className="self-end max-w-[85%] rounded-2xl bg-accent/60 px-4 py-2 text-[15px] leading-snug text-foreground">
        {turn.question}
      </p>

      {turn.answer !== undefined && (
        <div className="flex flex-col gap-2">
          {toolMeta && (
            <span className="inline-flex w-max items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <toolMeta.icon size={12} />
              {toolMeta.text}
            </span>
          )}
          <div
            className={`note-markdown text-[15px] leading-relaxed ${
              turn.error ? "text-destructive" : "text-foreground"
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
          </div>
          {turn.sources && turn.sources.length > 0 && <Sources sources={turn.sources} />}
        </div>
      )}
    </div>
  );
}

function Sources({ sources }: { sources: AiSource[] }) {
  return (
    <div className="mt-1 flex flex-col gap-1 border-l border-border/50 pl-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
        Sources
      </span>
      {sources.slice(0, 3).map((s) => (
        <span key={s.id} className="truncate text-xs text-muted-foreground">
          {s.type === "note" ? "📝" : "✓"} {s.text.split("\n")[0]}
        </span>
      ))}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.2s]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.4s]" />
    </div>
  );
}
