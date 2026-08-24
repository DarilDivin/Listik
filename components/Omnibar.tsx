"use client";

import { useRef, useState } from "react";
import { DatePickerButton } from "@/components/date-picker-button";
import { Button } from "@/components/ui/button";
import { Plus, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/omnibar/AutoGrowTextarea";
import { PrioritySelect } from "@/components/omnibar/PrioritySelect";
import { ModeBadge } from "@/components/omnibar/ModeBadge";
import { ListControl } from "@/components/todo/ListControl";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useTaskMode, type SmartTaskData } from "@/features/todos/useTaskMode";
import { useListAutocomplete } from "@/features/todos/useListAutocomplete";
import { useSlashCommands } from "@/features/omnibar/useSlashCommands";
import { commandForMode, type OmnibarMode } from "@/features/omnibar/commands";

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

interface OmnibarProps {
  /** Soumission d'une tâche (mode « task »). */
  onSubmit: (taskData: SmartTaskData) => Promise<void>;
  /** Soumission d'une note (mode « note » / `/note`). */
  onSubmitNote?: (text: string) => void | Promise<void>;
  /** Soumission d'une question à l'agent (mode « ask » / `/question`). */
  onSubmitAsk?: (text: string) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Si fourni, affiche un sélecteur de liste (avec ces suggestions). */
  lists?: string[];
  /** Mode actif au démarrage de cette surface (Alt+Q = « task »). */
  defaultMode?: OmnibarMode;
  /**
   * Habillage. « floating » (défaut) : barre posée au-dessus du contenu, fond
   * et ombre propres — fenêtre de capture rapide, Assistant. « inline » : la
   * barre EST une rangée de la liste où elle vit — fond de page, aucune ombre,
   * simple hairline au focus (voir `CaptureRow`).
   */
  variant?: "floating" | "inline";
  /**
   * Remplace la pastille de mode tant qu'on est dans le mode par défaut — la
   * rangée de capture y met un cercle fantôme, pour se lire comme une tâche
   * pas encore née. Un mode explicite (`/note`) reprend la pastille : là, le
   * changement d'élément EST le signal.
   */
  leading?: React.ReactNode;
  /** Indice discret à droite, au repos seulement (raccourci clavier). */
  hint?: React.ReactNode;
}

export default function Omnibar({
  onSubmit,
  onSubmitNote,
  onSubmitAsk,
  placeholder,
  autoFocus,
  lists,
  defaultMode = "ask",
  variant = "floating",
  leading,
  hint,
}: OmnibarProps) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<OmnibarMode>(defaultMode);
  const [isFocused, setIsFocused] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const isTask = mode === "task";
  const activeCommand = commandForMode(mode);
  const inline = variant === "inline";
  // Le cercle fantôme ne tient que dans le mode par défaut : dès qu'un mode
  // explicite est choisi, la pastille reprend sa place (c'est le signal).
  const showLeading = Boolean(leading) && mode === defaultMode;

  const focusField = () =>
    formRef.current?.querySelector("textarea")?.focus();

  const switchMode = (next: OmnibarMode) => {
    setMode(next);
    setValue("");
  };
  const clearMode = () => switchMode(defaultMode);

  // Logique du mode Tâche (contrôlée : le texte est détenu ici).
  const task = useTaskMode(value, setValue, onSubmit, lists ?? []);
  // Autocomplétion `#liste` (mode Tâche uniquement).
  const autocomplete = useListAutocomplete(value, setValue, lists ?? []);
  // Menu de commandes « slash ».
  const slash = useSlashCommands({ value, setValue, currentMode: mode, switchMode });

  const handleChange = (raw: string) => {
    if (slash.interceptChange(raw)) return;
    setValue(raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    slash.onKeyDown(e);
    if (e.defaultPrevented) return;
    if (isTask) autocomplete.onKeyDown(e);
    if (e.defaultPrevented) return;
    // Échap sur une barre inline vide : on rend simplement le focus — la
    // rangée reprend son habillage au repos (le menu slash et l'autocomplétion
    // ont déjà eu leur chance de consommer la touche). Jamais avec un
    // brouillon en cours : un texte tapé n'est pas jetable.
    if (inline && e.key === "Escape" && !value.trim()) {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  };

  const submitNote = async () => {
    const text = value.trim();
    if (!text || !onSubmitNote) return;
    try {
      await onSubmitNote(text);
      clearMode(); // retour au mode par défaut + champ vidé
    } catch {
      // l'erreur (toast) est gérée côté handler
    }
  };

  const submitAsk = async () => {
    const text = value.trim();
    if (!text || !onSubmitAsk) return;
    try {
      await onSubmitAsk(text);
      setValue(""); // on reste en mode « ask » pour enchaîner les questions
    } catch {
      // l'erreur (toast) est gérée côté handler
    }
  };

  const handleSubmit = () => {
    if (isTask) task.submit();
    else if (mode === "note") void submitNote();
    else if (mode === "ask") void submitAsk();
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

  const effectivePlaceholder = isTask
    ? placeholder ?? activeCommand.placeholder
    : activeCommand.placeholder;

  const menuOpen = slash.open || (isTask && autocomplete.open);

  const controls = (
    <>
      <DatePickerButton date={task.dueDate} onDateChange={task.handleDateChange} />
      <PrioritySelect value={task.priority} onChange={task.setPriority} />
      {lists !== undefined && (
        <ListControl
          list={task.list}
          lists={lists}
          onChange={task.setList}
        />
      )}
    </>
  );

  return (
    <motion.form
      ref={formRef}
      className={cn(
        "relative text-left",
        inline
          ? cn(
              // Padding CONSTANT entre repos et focus : le texte ne bouge pas
              // d'un pixel, seule l'enveloppe s'ouvre. Fond TOUJOURS
              // transparent — donc rigoureusement la couleur de la page, voile
              // d'accent du canvas compris (un `bg-background` opaque le
              // masquerait et redessinerait une carte). Aucune ombre : au
              // focus, une simple hairline.
              // Le rayon est animé par motion (voir `animate`) et NON par une
              // classe : `layout` écrit lui-même un border-radius en style
              // inline pendant ses animations, qui écraserait un `rounded-*`.
              "flex w-full items-start gap-3 bg-transparent px-3 py-2",
              "transition-[background-color,border-color] duration-300 ease-out",
              isFocused
                ? "border border-border/60"
                : "cursor-text border border-transparent hover:bg-foreground/[0.045]",
            )
          : cn(
              "flex w-full max-w-4xl items-stretch gap-2 rounded-[1.25rem] p-2",
              "transition-[background-color,border-color,box-shadow] duration-500 ease-out",
              isFocused
                ? "border border-border/60 bg-popover"
                : "border border-transparent bg-foreground/[0.035] dark:bg-foreground/[0.05]",
              isTask && task.hasGlow
                ? "shadow-[0_0_20px_rgba(250,204,21,0.18)] dark:shadow-[0_0_20px_rgba(250,204,21,0.12)]"
                : isFocused
                  ? "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_32px_-12px_rgba(0,0,0,0.55)]"
                  : "shadow-none",
            ),
      )}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      // Toute la rangée est une cible de saisie : cliquer dans la marge donne
      // le focus au champ (mousedown + preventDefault, sinon le clic le
      // reprendrait aussitôt).
      onMouseDown={(e) => {
        if (!inline || isFocused) return;
        if ((e.target as HTMLElement).closest("textarea, button")) return;
        e.preventDefault();
        focusField();
      }}
      layout
      animate={inline ? { borderRadius: isFocused ? 16 : 8 } : undefined}
      transition={{ type: "spring", bounce: 0.25, duration: 0.55 }}
      style={{ height: "auto", width: inline || isFocused ? "100%" : "auto" }}
      onBlur={handleFormBlur}
    >
      {showLeading ? (
        <span className="flex shrink-0 items-center">{leading}</span>
      ) : (
        <ModeBadge
          command={activeCommand}
          onClear={mode !== defaultMode ? clearMode : undefined}
        />
      )}

      {/* Colonne centrale : texte + contrôles (gère le passage multi-ligne,
          sans déplacer le badge qui reste à gauche en pleine hauteur). */}
      <div
        className={`flex min-w-0 flex-1 gap-2 ${
          multiline ? "flex-col" : "max-sm:flex-wrap items-center"
        }`}
      >
        <Popover
          open={menuOpen}
        onOpenChange={(o) => {
          if (!o) {
            slash.dismiss();
            autocomplete.dismiss();
          }
        }}
      >
        <PopoverAnchor asChild>
          <div className="relative min-w-0 flex-1">
            <AutoGrowTextarea
              value={value}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onEnter={handleSubmit}
              dateMatch={isTask ? task.dateMatch : null}
              listMatch={isTask ? task.listMatch : null}
              tagMatches={isTask ? task.tagMatches : undefined}
              placeholder={effectivePlaceholder}
              autoFocus={autoFocus}
              compact={inline}
              dimmed={inline && !isFocused}
              onMultilineChange={setMultiline}
              onKeyDown={handleKeyDown}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={10}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-64 p-1"
        >
          {slash.open
            ? slash.items.map((command, i) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => slash.accept(command)}
                    onMouseEnter={() => slash.setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      i === slash.highlight ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <Icon size={15} className="shrink-0 text-muted-foreground" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-foreground">{command.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {command.description}
                        {!command.enabled && " · bientôt"}
                      </span>
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">
                      {command.trigger}
                    </span>
                  </button>
                );
              })
            : autocomplete.items.map((item, i) => (
                <button
                  key={`${item.type}-${item.value}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => autocomplete.accept(item)}
                  onMouseEnter={() => autocomplete.setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    i === autocomplete.highlight ? "bg-accent" : "hover:bg-accent/60",
                    item.type === "create" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {item.type === "create" ? (
                    <>
                      <Plus size={14} className="shrink-0" />
                      Créer « {item.value} »
                    </>
                  ) : (
                    <>
                      <Tag size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.value}</span>
                    </>
                  )}
                </button>
              ))}
        </PopoverContent>
      </Popover>

      {/* Contrôles (date / priorité / liste) : mode Tâche uniquement. */}
      <AnimatePresence>
        {isTask &&
          isFocused &&
          (multiline ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-2 px-1 pb-0.5"
            >
              {controls}
            </motion.div>
          ) : (
            <motion.div
              layout
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              className="flex items-center justify-end flex-shrink-0"
            >
              <motion.div
                initial={{ x: 15, scale: 0.95, opacity: 0 }}
                animate={{ x: 0, scale: 1, opacity: 1 }}
                exit={{ x: 10, scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.5, delay: 0.05 }}
                className="flex items-center gap-2 w-max pl-2 pr-1"
              >
                {controls}
              </motion.div>
            </motion.div>
          ))}
      </AnimatePresence>
      </div>

      {/* Indice clavier : au repos seulement, et jamais par-dessus un
          brouillon (le bouton d'envoi occupe alors ce coin). */}
      {hint && !isFocused && !value.trim() && (
        <span className="flex shrink-0 items-center">{hint}</span>
      )}

      {/* Bouton d'envoi rapide quand la barre n'est pas focus (mode Tâche). */}
      <AnimatePresence>
        {isTask && !isFocused && value.trim() && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute right-2 top-2"
          >
            <Button
              variant="outline"
              type="submit"
              disabled={task.isSubmitting}
              className="bg-accent/50 hover:bg-accent font-bold border-none outline-none ring-0 rounded-full size-8 cursor-pointer"
            >
              <Plus />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
