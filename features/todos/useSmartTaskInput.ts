import { useEffect, useRef, useState } from "react";
import type { Priority } from "./types";
import {
  type DateMatch,
  detectListFromText,
  detectPriorityFromText,
  formatDateToNaturalText,
  parseTaskDate,
  replaceDateInText,
  splitNote,
  stripListFromText,
} from "./smartParse";

export interface SmartTaskData {
  text: string;
  note?: string;
  dueDate?: Date | null;
  priority?: Priority;
  list?: string | null;
}

// Sélecteurs gardant la barre ouverte quand le focus part vers un portail Radix
// (popover du calendrier, listbox du select…).
const KEEP_OPEN_SELECTORS = [
  "[data-radix-portal]",
  "[data-radix-popper-content-wrapper]",
  '[role="listbox"]',
  '[role="option"]',
  '[role="dialog"]',
  '[data-state="open"]',
  ".calendar",
];

/**
 * État et logique de SmartTaskInput, isolés de la vue.
 * - parse date/priorité/note du texte ;
 * - synchronise le DatePicker manuel avec le texte ;
 * - la priorité auto-détectée n'écrase plus une sélection manuelle (fix B3).
 */
export function useSmartTaskInput(
  onSubmit: (data: SmartTaskData) => Promise<void>,
  lists: string[] = [],
) {
  const [task, setTask] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [list, setList] = useState<string | null>(null);
  const [dateMatch, setDateMatch] = useState<DateMatch | null>(null);
  const [listMatch, setListMatch] = useState<DateMatch | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const isManualDateUpdate = useRef(false);
  // Dernière valeur issue de la détection : on ne ré-applique l'auto-détection
  // que lorsque le RÉSULTAT change, sans effacer un choix manuel entre-temps.
  const lastDetectedPriority = useRef<Priority>("normal");
  const lastDetectedList = useRef<string | null>(null);

  useEffect(() => {
    // Mise à jour manuelle via le DatePicker → ne pas re-parser le texte.
    if (isManualDateUpdate.current) {
      isManualDateUpdate.current = false;
      return;
    }

    const parsed = parseTaskDate(task);
    setDueDate(parsed?.date ?? null);
    setDateMatch(parsed?.match ?? null);

    const detected = detectPriorityFromText(task);
    if (detected !== lastDetectedPriority.current) {
      setPriority(detected);
      lastDetectedPriority.current = detected;
    }

    const detectedList = detectListFromText(task);
    setListMatch(detectedList?.match ?? null);
    const listName = detectedList?.list ?? null;
    if (listName !== lastDetectedList.current) {
      setList(listName);
      lastDetectedList.current = listName;
    }
  }, [task]);

  const handleDateChange = (newDate?: Date) => {
    const selected = newDate ?? null;
    isManualDateUpdate.current = true;

    const updated = replaceDateInText(task, selected, dateMatch);
    setTask(updated);
    setDueDate(selected);

    if (selected) {
      const text = formatDateToNaturalText(selected);
      setDateMatch({ index: updated.lastIndexOf(text), text });
    } else {
      setDateMatch(null);
    }
  };

  const submit = async () => {
    if (!task.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { mainText, note } = splitNote(task);
      const text = stripListFromText(mainText); // retire le tag #liste du texte
      // Canonise vers une liste existante (à la casse près) pour éviter les doublons.
      const canonicalList = list
        ? lists.find((l) => l.toLowerCase() === list.toLowerCase()) ?? list
        : null;
      await onSubmit({ text, note, dueDate, priority, list: canonicalList });

      setTask("");
      setDueDate(null);
      setDateMatch(null);
      setPriority("normal");
      lastDetectedPriority.current = "normal";
      setList(null);
      setListMatch(null);
      lastDetectedList.current = null;
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ferme la barre seulement si le focus quitte réellement le formulaire
  // (et pas vers un portail Radix).
  const handleFormBlur = () => {
    setTimeout(() => {
      if (!formRef.current) return;
      const active = document.activeElement;
      const staysOpen = KEEP_OPEN_SELECTORS.some(
        (selector) => active?.closest(selector) !== null,
      );
      if (!formRef.current.contains(active as Node) && !staysOpen) {
        setIsFocused(false);
      }
    }, 150);
  };

  const hasGlow = task.includes("//") || dateMatch !== null || listMatch !== null;

  return {
    task,
    setTask,
    dueDate,
    priority,
    setPriority,
    list,
    setList,
    dateMatch,
    listMatch,
    isFocused,
    setIsFocused,
    isSubmitting,
    formRef,
    hasGlow,
    handleDateChange,
    handleFormBlur,
    submit,
  };
}
