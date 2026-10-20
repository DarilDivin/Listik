/**
 * Ce que fait l'Assistant, en direct — pour l'orbe de réflexion.
 *
 * Quand l'IA travaille, elle passe obligatoirement par les outils de Listik
 * (lire les tâches, en créer, lire le journal…), et c'est l'app qui les
 * exécute : Rust annonce chaque appel (`assistant:activite`, voir
 * `cli_agent::DbExecutor::annoncer_activite`). On sait donc VRAIMENT ce
 * qu'elle fait — l'orbe ne devine pas.
 *
 * Trois états, pas plus : ceux qu'on peut affirmer.
 *   — réfléchit : dès l'envoi, et entre deux outils ;
 *   — cherche   : elle lit tes tâches ou ton journal ;
 *   — agit      : elle crée ou modifie quelque chose.
 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export const ACTIVITE_EVENT = "assistant:activite";

export type Etat = "reflechit" | "cherche" | "agit";

export interface Activite {
  etat: Etat;
  /** L'outil appelé, pour une phrase précise. Absent quand elle réfléchit. */
  outil?: string;
}

/**
 * Un outil s'exécute en quelques millisecondes : affiché le temps réel, son
 * état clignoterait sans qu'on ait pu le lire. On le garde au moins ce
 * temps-là, puis l'orbe revient à « réfléchit » — ce qui est vrai : l'IA
 * reprend sa réflexion avec ce qu'elle vient de lire ou de faire.
 */
const DUREE_MINIMALE_MS = 1600;

/** La phrase qui accompagne l'orbe. Trois mots valent mieux qu'une animation. */
export function phrase({ etat, outil }: Activite): string {
  if (etat === "reflechit") return "Réfléchit…";
  switch (outil) {
    case "list_todos":
      return "Parcourt tes tâches…";
    case "list_journal":
      return "Relit ton journal…";
    case "create_todo":
      return "Crée une tâche…";
    case "update_todo":
    case "toggle_todo":
      return "Met à jour une tâche…";
    case "create_journal_entry":
      return "Écrit dans ton journal…";
    default:
      return etat === "cherche" ? "Cherche…" : "Agit…";
  }
}

/**
 * Suit l'activité de l'Assistant tant que le composant est monté : on le
 * monte au moment où une question part, et l'état démarre à « réfléchit ».
 */
export function useActivite(): Activite {
  const [activite, setActivite] = useState<Activite>({ etat: "reflechit" });
  const retour = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unlisten = listen<{ etat: Etat; outil?: string }>(ACTIVITE_EVENT, ({ payload }) => {
      if (payload.etat !== "cherche" && payload.etat !== "agit") return;
      setActivite({ etat: payload.etat, outil: payload.outil });
      if (retour.current) clearTimeout(retour.current);
      retour.current = setTimeout(() => setActivite({ etat: "reflechit" }), DUREE_MINIMALE_MS);
    });
    return () => {
      if (retour.current) clearTimeout(retour.current);
      void unlisten.then((stop) => stop());
    };
  }, []);

  return activite;
}
