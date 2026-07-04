import { useEffect, useRef, useState } from "react";
import type { Priority } from "./types";
import { aiParseTask } from "./aiParse";
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

/**
 * Logique du mode « Tâche » de l'Omnibar, en version **contrôlée** : le texte
 * (`value`/`setValue`) est détenu par l'Omnibar, ce qui permet de partager une
 * seule barre de saisie entre les différents modes et le menu de commandes.
 *
 * - parse date / priorité / liste depuis le texte ;
 * - synchronise le DatePicker manuel avec le texte ;
 * - la priorité auto-détectée n'écrase pas une sélection manuelle.
 */
export function useTaskMode(
  value: string,
  setValue: (v: string) => void,
  onSubmit: (data: SmartTaskData) => Promise<void>,
  lists: string[] = [],
) {
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [list, setList] = useState<string | null>(null);
  const [dateMatch, setDateMatch] = useState<DateMatch | null>(null);
  const [listMatch, setListMatch] = useState<DateMatch | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isManualDateUpdate = useRef(false);
  // Dernier résultat de détection : on ne ré-applique l'auto-détection que
  // lorsque le RÉSULTAT change, sans effacer un choix manuel entre-temps.
  const lastDetectedPriority = useRef<Priority>("normal");
  const lastDetectedList = useRef<string | null>(null);

  useEffect(() => {
    // Mise à jour manuelle via le DatePicker → ne pas re-parser le texte.
    if (isManualDateUpdate.current) {
      isManualDateUpdate.current = false;
      return;
    }

    const parsed = parseTaskDate(value);
    setDueDate(parsed?.date ?? null);
    setDateMatch(parsed?.match ?? null);

    const detected = detectPriorityFromText(value);
    if (detected !== lastDetectedPriority.current) {
      setPriority(detected);
      lastDetectedPriority.current = detected;
    }

    const detectedList = detectListFromText(value);
    setListMatch(detectedList?.match ?? null);
    const listName = detectedList?.list ?? null;
    if (listName !== lastDetectedList.current) {
      setList(listName);
      lastDetectedList.current = listName;
    }
  }, [value]);

  const handleDateChange = (newDate?: Date) => {
    const selected = newDate ?? null;
    isManualDateUpdate.current = true;

    const updated = replaceDateInText(value, selected, dateMatch);
    setValue(updated);
    setDueDate(selected);

    if (selected) {
      const text = formatDateToNaturalText(selected);
      setDateMatch({ index: updated.lastIndexOf(text), text });
    } else {
      setDateMatch(null);
    }
  };

  const resetMeta = () => {
    setDueDate(null);
    setDateMatch(null);
    setPriority("normal");
    lastDetectedPriority.current = "normal";
    setList(null);
    setListMatch(null);
    lastDetectedList.current = null;
  };

  const submit = async () => {
    if (!value.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { mainText, note } = splitNote(value);
      const text = stripListFromText(mainText); // retire le tag #liste du texte
      // Canonise vers une liste existante (à la casse près) pour éviter les doublons.
      const canonicalList = list
        ? lists.find((l) => l.toLowerCase() === list.toLowerCase()) ?? list
        : null;

      // Correction IA de la priorité (négation/contexte) — seulement si elle
      // n'a pas été choisie manuellement depuis la dernière auto-détection.
      let finalPriority = priority;
      const aiResult = await aiParseTask(value);
      if (aiResult && priority === lastDetectedPriority.current) {
        finalPriority = aiResult.priority;
      }

      await onSubmit({ text, note, dueDate, priority: finalPriority, list: canonicalList });

      setValue("");
      resetMeta();
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasGlow = value.includes("//") || dateMatch !== null || listMatch !== null;

  return {
    dueDate,
    priority,
    setPriority,
    list,
    setList,
    dateMatch,
    listMatch,
    isSubmitting,
    hasGlow,
    handleDateChange,
    submit,
  };
}
