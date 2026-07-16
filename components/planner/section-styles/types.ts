import type { Todo, UpdateTodoInput } from "@/features/todos/types";

/** Interface commune à tous les renderers de section (Liste, Horizon, Zoom…). */
export interface SectionStyleProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, payload: UpdateTodoInput) => void;
  overdue?: boolean;
  /**
   * Afficher la date planifiée sur chaque ligne. Faux pour les sections dont la
   * date est implicite (Aujourd'hui, Demain) : l'y répéter est du bruit. Les
   * styles qui regroupent déjà par date (Zoom, Stratigraphie) l'ignorent.
   */
  showDate?: boolean;
}
