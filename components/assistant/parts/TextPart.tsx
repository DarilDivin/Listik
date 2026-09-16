import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Équivalent du `TextPart` du template shadcn/chatbot. Le template rend le
 * markdown avec `typeset` (une feuille de 12 ko du registre) ; on garde
 * `.note-markdown`, la voix markdown déjà en place dans les Notes et le
 * Journal — l'assistant écrit comme le reste de l'app.
 */
export function TextPart({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  if (!text.trim()) return null;

  return (
    <div
      className={cn(
        "note-markdown text-[15px] leading-relaxed",
        tone === "error" ? "text-destructive" : "text-foreground",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
