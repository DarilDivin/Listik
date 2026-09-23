"use client";

import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";

/**
 * Amorces de conversation (`suggestions.tsx` du template). Le texte affiché
 * préremplit la question : sur un assistant en langage naturel, la puce
 * enseigne la formulation sans retirer à la personne la possibilité de la
 * relire ou de la modifier avant l'envoi.
 *
 * Elles partent directement, sans passer par le champ — comme dans le
 * template, et parce que l'Omnibar tient sa valeur en interne (aucune API
 * impérative pour la pré-remplir).
 */
const SUGGESTIONS = [
  "Ajoute appeler le dentiste vendredi",
  "Qu'est-ce que j'ai cette semaine ?",
  "Qu'est-ce qui est en retard ?",
  "Note : idée d'article sur le RAG",
];

export function Suggestions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((prompt, i) => (
        <motion.div
          key={prompt}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.smooth, delay: 0.12 + i * 0.05 }}
          whileTap={{ scale: 0.97 }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(prompt)}
            className="h-auto rounded-full border-border/60 bg-transparent px-3.5 py-2 text-[13px] font-normal whitespace-normal text-muted-foreground shadow-none hover:border-border hover:bg-accent/40 hover:text-foreground"
          >
            {prompt}
          </Button>
        </motion.div>
      ))}
    </div>
  );
}
