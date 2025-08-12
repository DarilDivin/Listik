"use client";
import { DatePickerButton } from "@/components/date-picker-button";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import * as chrono from "chrono-node";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Priority } from "@/types/todo";

interface SmartTaskInputProps {
  onSubmit: (taskData: {
    text: string;
    dueDate?: Date | null;
    priority?: Priority;
  }) => Promise<void>;
  placeholder?: string;
}

export default function SmartTaskInput({
  onSubmit,
  placeholder = "Ajouter une tâche",
}: SmartTaskInputProps) {
  const [task, setTask] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<Priority>(Priority.Normal);
  const [dateMatch, setDateMatch] = useState<{
    index: number;
    text: string;
  } | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const lastDetectedDate = useRef<number | null>(null);
  const isManualDateUpdate = useRef<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Fonction pour formater une date en texte naturel français
  function formatDateToNaturalText(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const targetDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    if (targetDate.getTime() === today.getTime()) {
      return "aujourd'hui";
    } else if (targetDate.getTime() === tomorrow.getTime()) {
      return "demain";
    } else {
      return format(date, "EEEE d MMMM", { locale: fr });
    }
  }

  // Fonction pour remplacer ou ajouter une date dans le texte
  function updateTaskWithDate(
    currentTask: string,
    newDate: Date | null
  ): string {
    if (!newDate) {
      // Supprimer la date existante si aucune nouvelle date
      if (dateMatch) {
        return (
          currentTask.slice(0, dateMatch.index) +
          currentTask.slice(dateMatch.index + dateMatch.text.length)
        );
      }
      return currentTask;
    }

    const dateText = formatDateToNaturalText(newDate);

    if (dateMatch) {
      // Remplacer la date existante
      return (
        currentTask.slice(0, dateMatch.index) +
        dateText +
        currentTask.slice(dateMatch.index + dateMatch.text.length)
      );
    } else {
      // Ajouter la date à la fin
      return currentTask.trim() + (currentTask.trim() ? " " : "") + dateText;
    }
  }

  // Détecter la priorité dans le texte
  const detectPriorityFromText = (text: string): Priority => {
    const lowerText = text.toLowerCase();

    if (
      lowerText.includes("urgent") ||
      lowerText.includes("important") ||
      lowerText.includes("!!")
    ) {
      return Priority.High;
    } else if (lowerText.includes("!") || lowerText.includes("asap")) {
      return Priority.High;
    } else if (
      lowerText.includes("plus tard") ||
      lowerText.includes("quand possible")
    ) {
      return Priority.Low;
    }

    return Priority.Normal;
  };

  // Détection de date à chaque changement de task
  useEffect(() => {
    // Éviter la boucle infinie lors des mises à jour manuelles
    if (isManualDateUpdate.current) {
      isManualDateUpdate.current = false;
      return;
    }

    const results = chrono.fr.parse(task, new Date(), { forwardDate: true });
    if (results.length > 0) {
      const { index, text: dateText, start } = results[0];
      const newDate = start.date();
      const newDateTime = newDate.getTime();

      // Animation seulement si nouvelle date détectée
      if (lastDetectedDate.current !== newDateTime) {
        setShowAnimation(true);
        setTimeout(() => setShowAnimation(false), 600);
        lastDetectedDate.current = newDateTime;
      }

      setDueDate(newDate);
      setDateMatch({ index, text: dateText });
    } else {
      setDueDate(null);
      setDateMatch(null);
      lastDetectedDate.current = null;
    }

    // Détection automatique de priorité
    const detectedPriority = detectPriorityFromText(task);
    if (detectedPriority !== priority) {
      setPriority(detectedPriority);
    }
  }, [task]);

  // Gestionnaire pour les changements de date du DatePicker
  const handleDateChange = (newDate: Date | undefined) => {
    const selectedDate = newDate || null;

    // Marquer comme mise à jour manuelle pour éviter les conflits
    isManualDateUpdate.current = true;

    // Mettre à jour le texte avec la nouvelle date
    const updatedTask = updateTaskWithDate(task, selectedDate);
    setTask(updatedTask);

    // Mettre à jour l'état de la date
    setDueDate(selectedDate);

    // Mettre à jour dateMatch pour le highlight
    if (selectedDate) {
      const dateText = formatDateToNaturalText(selectedDate);
      const index = updatedTask.lastIndexOf(dateText);
      setDateMatch({ index, text: dateText });

      // Animation pour la nouvelle date
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 600);
    } else {
      setDateMatch(null);
    }
  };

  // Surlignage visuel avec animation
  function highlightDate(text: string) {
    if (dateMatch) {
      return (
        <>
          {text.slice(0, dateMatch.index)}
          <motion.span
            initial={{ backgroundColor: "#e0e7ff", scale: 1.1, opacity: 0.8 }}
            animate={{
              backgroundColor: "#e0e7ff90",
              scale: 1,
              opacity: 1,
            }}
            transition={{
              type: "spring", // effet élastique
              damping: 15, // Contrôle le rebond (plus bas = plus de rebond)
              stiffness: 300, // Contrôle la vitesse (plus haut = plus rapide)
              mass: 0.8, // Contrôle l'inertie
            }}
            style={{
              color: "#3730a3",
              borderRadius: 4,
              padding: "0 0px",
              display: "inline-block",
            }}
          >
            {dateMatch.text}
          </motion.span>
          {text.slice(dateMatch.index + dateMatch.text.length)}
        </>
      );
    }
    return text;
  }

  // Gestionnaire de soumission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      await onSubmit({
        text: task.trim(),
        dueDate,
        priority,
      });

      // Reset du formulaire
      setTask("");
      setDueDate(null);
      setDateMatch(null);
      setPriority(Priority.Normal);
      lastDetectedDate.current = null;
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animation variants
  const containerVariants = {
    collapsed: {
      width: "auto",
      height: "auto",
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 300,
        when: "beforeChildren" as const,
        delay: 0.1,
      },
    },
    expanded: {
      width: "100%",
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 300,
        when: "beforeChildren" as const,
      },
    },
  } as const;

  const controlsVariants = {
    hidden: {
      opacity: 0,
      scale: 0.8,
      x: 20,
      transition: {
        type: "spring" as const,
        damping: 25,
        stiffness: 300,
      },
    },
    visible: {
      opacity: 1,
      scale: 1,
      x: 0,
      transition: {
        type: "spring" as const,
        damping: 20,
        stiffness: 300,
        staggerChildren: 0.1,
        delay: 0.5,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      scale: 0.8,
      y: 10,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        damping: 20,
        stiffness: 400,
        delay: 0.5,
      },
    },
  };

  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // ← Ajouter ref pour textarea
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Quand task devient vide, remettre les hauteurs à zéro
    if (task === "") {
      if (textareaRef.current) {
        textareaRef.current.style.height = "32px";
      }
      if (overlayRef.current) {
        overlayRef.current.style.height = "32px";
      }
    }
  }, [task]);

  const handleFormBlur = (e: React.FocusEvent) => {
    setTimeout(() => {
      // Utiliser la ref au lieu de e.currentTarget
      if (!formRef.current) return;

      const activeElement = document.activeElement;

      const keepOpenSelectors = [
        "[data-radix-portal]",
        '[role="listbox"]',
        '[role="option"]',
        '[role="dialog"]',
        '[data-state="open"]',
        ".calendar",
      ];

      const shouldStayOpen = keepOpenSelectors.some(
        (selector) => activeElement?.closest(selector) !== null
      );

      const isInForm = formRef.current.contains(activeElement as Node);

      if (!isInForm && !shouldStayOpen) {
        setIsFocused(false);
      }
    }, 150);
  };

  console.log(isFocused, "isFocused");

  return (
    <motion.form
      ref={formRef}
      className={`w-full max-w-4xl max-sm:rounded-xl rounded-3xl bg-white py-2 px-2 shadow flex max-sm:flex-wrap items-start gap-4 justify-baseline relative`}
      onSubmit={handleSubmit}
      layout
      transition={{
        type: "spring",
        damping: 25,
        stiffness: 300,
        duration: 0.5,
      }}
      style={{
        backgroundColor: isFocused ? "#f0f0f0" : "#f0f0f0dd",
        height: isFocused ? "auto" : "auto",
        width: isFocused ? "100%" : "auto",
      }}
      onBlur={handleFormBlur}
    >
      <div className="relative w-full flex items-center">
        <textarea
          name="task"
          value={task}
          id=""
          ref={textareaRef}
          placeholder={placeholder}
          className="w-full max-sm:min-w-[320px] min-w-[440px] max-sm:pl-0 h-8 pl-4 pt-[2px] leading-8 outline-none font-normal text-transparent placeholder:text-gray-400 text-xl border-none resize-none bg-transparent overflow-hidden"
          style={{
            height: "32px",
            caretColor: "#374151",
            lineHeight: "1.5",
          }}
          onChange={(e) => setTask(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "32px";
            target.style.height = Math.max(target.scrollHeight, 32) + "px";

            // Synchroniser la hauteur de l'overlay
            const overlay = target.parentElement?.querySelector(
              ".text-overlay"
            ) as HTMLElement;
            if (overlay) {
              overlay.style.height = target.style.height;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const form = (e.target as HTMLTextAreaElement).form;
              if (form) form.requestSubmit();
            }
          }}
        />
        <div
          ref={overlayRef}
          className="text-overlay max-sm:min-w-[320px] min-w-[440px] max-sm:pl-0 pl-4 pt-[2px] leading-8 text-gray-800 pointer-events-none w-full absolute top-0 left-0 z-0 font-normal text-xl"
          style={{
            height: "32px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: "1.5",
          }}
          aria-hidden
        >
          {highlightDate(task)}
        </div>
      </div>
      <AnimatePresence>
        <motion.div
          className={`flex items-center gap-3 flex-shrink-0 ${
            isFocused ? "w-auto visible" : "w-0 hidden"
          }`}
          variants={controlsVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div variants={itemVariants}>
            <DatePickerButton date={dueDate} onDateChange={handleDateChange} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <Select
              name="priority"
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
            >
              <SelectTrigger
                className={`w-[140px] h-8 text-sm border-none outline-none ring-none transition-colors ${
                  priority === Priority.High
                    ? "bg-red-100/80"
                    : priority === Priority.Normal
                    ? "bg-blue-100/80"
                    : "bg-green-100/80"
                }`}
              >
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Priority.Low}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    Basse
                  </div>
                </SelectItem>
                <SelectItem value={Priority.Normal}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    Normale
                  </div>
                </SelectItem>
                <SelectItem value={Priority.High}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    Haute
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        </motion.div>
      </AnimatePresence>
      {/* Indicateur de focus subtil */}
      <motion.div
        className="absolute bottom-0 left-1/2 h-[1px] bg-gradient-to-r from-blue-500 to-purple-500"
        initial={{
          width: 0,
          x: "-50%", // Centrer l'élément
        }}
        animate={{
          width: isFocused ? "96%" : 0,
          x: "-50%", // Maintenir le centrage
        }}
        transition={{
          type: "spring",
          damping: 25,
          stiffness: 300,
        }}
      />
      <Button
        variant="outline"
        type="submit"
        disabled={isSubmitting || !task.trim()}
        className="bg-gray-200/50 font-bold border-none outline-none ring-none rounded-full size-8 cursor-pointer max-sm:absolute right-2 bottom-2"
      >
        <Plus />
      </Button>
    </motion.form>
  );
}
