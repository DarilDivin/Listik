import { useEffect, useRef, useState } from "react";
import type { Priority } from "./types";
import {
  type DateMatch,
  detectListFromText,
  detectTagMatchesFromText,
  detectTagsFromText,
  detectPriorityFromText,
  formatDateToNaturalText,
  parseTaskDate,
  replaceDateInText,
  stripDateFromText,
  splitNote,
  stripListFromText,
  stripTagsFromText,
} from "./smartParse";

export interface SmartTaskData {
  text: string;
  note?: string;
  dueDate?: Date | null;
  priority?: Priority;
  /** Projet écrit `#nom` (résolu en id par l'appelant). */
  list?: string | null;
  /** Tags écrits `@nom` (résolus en ids par l'appelant). */
  tags?: string[];
  /** Saisie brute, telle que tapée — la correction IA travaille dessus. */
  rawText?: string;
  /** `false` si l'utilisateur a choisi la priorité à la main : l'IA ne doit
   *  alors pas la réécrire. */
  aiPriorityAllowed?: boolean;
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
  const [tagMatches, setTagMatches] = useState<DateMatch[]>([]);
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

    setTagMatches(detectTagMatchesFromText(value).map((t) => t.match));

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
    setTagMatches([]);
    lastDetectedList.current = null;
  };

  const submit = async () => {
    if (!value.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { mainText, note } = splitNote(value);
      // Retire du titre les marqueurs `#projet` et `@tag` : ce sont des
      // attributs, pas des mots de la tâche.
      const withoutMarkers = stripTagsFromText(stripListFromText(mainText));
      // La date en est un aussi : « Réviser le CV demain » serait faux dès le
      // lendemain. On la re-détecte SUR LE TEXTE COURANT plutôt que de
      // réutiliser `dateMatch` — ses index portent sur `value`, que les deux
      // retraits précédents ont déjà décalé.
      const stripped = stripDateFromText(
        withoutMarkers,
        parseTaskDate(withoutMarkers)?.match ?? null,
      );
      // Une saisie qui n'est QUE une date (« demain ») donnerait un titre
      // vide : on garde alors le texte tel quel plutôt qu'une tâche sans nom.
      const text = stripped || withoutMarkers;
      const tags = detectTagsFromText(mainText);
      // Canonise vers une liste existante (à la casse près) pour éviter les doublons.
      const canonicalList = list
        ? lists.find((l) => l.toLowerCase() === list.toLowerCase()) ?? list
        : null;

      // La correction IA de la priorité N'EST PLUS attendue ici : elle partait
      // sur le réseau (timeout 8 s côté Rust) AVANT l'écriture, donc sur le
      // geste le plus répété de l'app, rien n'apparaissait tant qu'elle
      // n'avait pas répondu. Elle est désormais appliquée après coup par la
      // couche données (voir `createTodoFromSmart`), en écriture optimiste.
      await onSubmit({
        text,
        note,
        dueDate,
        priority,
        list: canonicalList,
        tags,
        rawText: value,
        aiPriorityAllowed: priority === lastDetectedPriority.current,
      });

      setValue("");
      resetMeta();
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasGlow =
    value.includes("//") ||
    dateMatch !== null ||
    listMatch !== null ||
    tagMatches.length > 0;

  return {
    dueDate,
    priority,
    setPriority,
    list,
    setList,
    dateMatch,
    listMatch,
    tagMatches,
    isSubmitting,
    hasGlow,
    handleDateChange,
    submit,
  };
}
