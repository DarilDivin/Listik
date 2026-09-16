"use client";

import { motion } from "motion/react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { TextPart } from "@/components/assistant/parts/TextPart";
import { ThinkingIndicator } from "@/components/assistant/ThinkingIndicator";
import type { Turn } from "@/features/assistant/conversation";
import { spring } from "@/lib/motion";

/**
 * Un tour rendu avec le vocabulaire du template shadcn/chatbot : la question
 * en `Bubble` alignée à droite, la réponse à plat dans le `MessageContent`
 * (pas de bulle côté agent — §2.5 : le contenu ne vit pas dans une surface).
 *
 * Le motion enveloppe le `Message` et non la bulle : `Message` porte le
 * `group/message` dont dépend l'alignement de la bulle.
 */
export function ChatMessage({ turn, pending = false }: { turn: Turn; pending?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.smooth}
      >
        <Message align="end">
          <MessageContent>
            <Bubble align="end" variant="brand">
              <BubbleContent className="rounded-br-md">{turn.question}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </motion.div>

      {(turn.answer !== undefined || pending) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
        >
          <Message align="start">
            <MessageContent>
              {turn.answer !== undefined ? (
                <TextPart text={turn.answer} tone={turn.error ? "error" : "default"} />
              ) : (
                <ThinkingIndicator />
              )}
            </MessageContent>
          </Message>
        </motion.div>
      )}
    </div>
  );
}
