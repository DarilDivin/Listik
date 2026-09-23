"use client";

import { useEffect, useRef, useState } from "react";
import { DatePickerButton } from "@/components/date-picker-button";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/omnibar/AutoGrowTextarea";
import dynamic from "next/dynamic";
import type { TokenClick } from "@/components/omnibar/CaptureField";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import { PrioritySelect } from "@/components/omnibar/PrioritySelect";
import { ListControl } from "@/components/todo/ListControl";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useTaskMode, type SmartTaskData } from "@/features/todos/useTaskMode";
import { useListAutocomplete } from "@/features/todos/useListAutocomplete";

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
 * L'editeur n'est charge QUE par la variante inline (voir Omnibar.tsx pour
 * le detail du compromis `next/dynamic`).
 */
const CaptureField = dynamic(
  () => import("@/components/omnibar/CaptureField").then((m) => m.CaptureField),
  {
    ssr: false,
    loading: () => <div className="min-h-6 w-full" />,
  },
);

interface BarreTacheProps {
  /** Soumission d'une tâche. */
  onSubmit: (taskData: SmartTaskData) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Si fourni, affiche un sélecteur de liste (avec ces suggestions). */
  lists?: string[];
  /**
   * Habillage. « floating » (défaut) : barre posée au-dessus du contenu, fond
   * et ombre propres. « inline » : la barre EST une rangée de la liste où elle
   * vit — fond de page, aucune ombre, simple hairline au focus.
   */
  variant?: "floating" | "inline";
  /** Icône de tête. Par défaut, la pastille Tâche. */
  leading?: React.ReactNode;
  /** Indice discret à droite, au repos seulement (raccourci clavier). */
  hint?: React.ReactNode;
  /** Les contrôles visuels sont utiles dans le Planificateur ; la fenêtre
   * rapide peut choisir une capture entièrement en langage naturel. */
  showControls?: boolean;
  /** Informe un hôte compact qu'un sélecteur porté dans un portail est ouvert. */
  onOverlayChange?: (open: boolean) => void;
}

/**
 * La barre de création de tâche, seule — issue du découpage de l'ancien
 * Omnibar à modes (voir docs/ROADMAP-BARRES.md, étape 1). Aucune notion de
 * mode ici : elle ne fait qu'une chose (créer une tâche), et peut donc la
 * faire bien — jetons cliquables (date, projet, priorité), analyse en
 * langage naturel. Utilisée par la rangée de capture du planificateur et, à
 * terme, par la fenêtre rapide.
 */
export default function BarreTache({
  onSubmit,
  placeholder,
  autoFocus,
  lists,
  variant = "floating",
  leading,
  hint,
  showControls: controlsEnabled = true,
  onOverlayChange,
}: BarreTacheProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [multiline, setMultiline] = useState(false);
  // Jeton designe a la souris : son selecteur s'ouvre a l'endroit du mot.
  const [tokenEdit, setTokenEdit] = useState<TokenClick | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const inline = variant === "inline";

  const focusField = () =>
    formRef.current
      ?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')
      ?.focus();

  const task = useTaskMode(value, setValue, onSubmit, lists ?? []);
  const autocomplete = useListAutocomplete(value, setValue, lists ?? []);

  // L'ancre du selecteur est figee aux coordonnees du clic : si la page
  // defile, elle ne suit pas. On referme plutot que de laisser un popover
  // flotter loin de son mot.
  useEffect(() => {
    if (!tokenEdit) return;
    const close = () => setTokenEdit(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [tokenEdit]);

  // Les listes et calendriers de Radix sont rendus hors de la barre. La
  // fenêtre rapide les utilise pour étendre temporairement son webview ; le
  // planificateur, lui, n'a rien de particulier à faire.
  useEffect(() => {
    onOverlayChange?.(tokenEdit !== null || autocomplete.open);
  }, [autocomplete.open, onOverlayChange, tokenEdit]);

  /** Remplace dans le texte le fragment reconnu par une nouvelle ecriture. */
  const rewriteToken = (match: { index: number; text: string }, next: string) => {
    const rebuilt =
      value.slice(0, match.index) + next + value.slice(match.index + match.text.length);
    // Effacer un mot laisse une double espace derriere lui.
    setValue(next ? rebuilt : rebuilt.replace(/\s{2,}/g, " ").trimStart());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    autocomplete.onKeyDown(e);
    if (e.defaultPrevented) return;
    // Échap sur une barre inline vide : on rend simplement le focus. Jamais
    // avec un brouillon en cours : un texte tapé n'est pas jetable.
    if (inline && e.key === "Escape" && !value.trim()) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
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

  const effectivePlaceholder = placeholder ?? "Capturer une tâche…";

  const stackControls = controlsEnabled && (inline
    ? isFocused && value.trim().length > 0
    : multiline);

  const showControls = controlsEnabled && isFocused && (!inline || value.trim().length > 0);

  // Un attribut deja ecrit dans le texte y est MODIFIABLE (on clique son
  // jeton) : afficher en plus son bouton le montrerait deux fois. Reserve a
  // la variante inline : ailleurs, les fragments ne sont pas cliquables.
  const tokenIsEditable = inline;
  const controls = (
    <>
      {!(tokenIsEditable && task.dateMatch) && (
        <DatePickerButton date={task.dueDate} onDateChange={task.handleDateChange} />
      )}
      {!(tokenIsEditable && task.priorityMatch && !task.priorityDetached) && (
        <PrioritySelect value={task.priority} onChange={task.setPriority} />
      )}
      {lists !== undefined && !(tokenIsEditable && task.listMatch) && (
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
              "flex w-full flex-wrap items-start gap-x-3 bg-transparent px-3 py-3.5",
              "transition-[background-color,border-color,border-radius] duration-300 ease-out",
              isFocused
                ? "rounded-xl border border-border/60"
                : "cursor-text rounded-lg border border-transparent hover:bg-foreground/[0.045]",
            )
          : cn(
              "flex w-full max-w-4xl items-stretch gap-2 rounded-2xl p-2",
              "transition-[background-color,border-color,box-shadow] duration-500 ease-out",
              isFocused
                ? "border border-border/60 bg-popover"
                : "border border-transparent bg-foreground/[0.035] dark:bg-foreground/[0.05]",
              task.hasGlow
                ? "shadow-[0_0_20px_rgba(250,204,21,0.18)] dark:shadow-[0_0_20px_rgba(250,204,21,0.12)]"
                : isFocused
                  ? "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_32px_-12px_rgba(0,0,0,0.55)]"
                  : "shadow-none",
            ),
      )}
      onSubmit={(e) => {
        e.preventDefault();
        task.submit();
      }}
      // Toute la rangée est une cible de saisie : cliquer dans la marge donne
      // le focus au champ.
      onMouseDown={(e) => {
        if (!inline || isFocused) return;
        if ((e.target as HTMLElement).closest("textarea, button")) return;
        e.preventDefault();
        focusField();
      }}
      layout={!inline}
      transition={{ type: "spring", bounce: 0.25, duration: 0.55 }}
      style={{ height: "auto", width: inline || isFocused ? "100%" : "auto" }}
      onBlur={handleFormBlur}
    >
      {leading ? (
        <span className="flex shrink-0 items-center">{leading}</span>
      ) : (
        <span
          className="grid size-9 shrink-0 self-start place-items-center rounded-xl bg-sky-500/8 text-sky-600 dark:text-sky-400"
          aria-label="Tâche"
          title="Tâche"
        >
          <ListTodo className="size-[18px]" />
        </span>
      )}

      <div
        className={`flex min-w-0 flex-1 gap-2 ${
          stackControls ? "flex-col" : "max-sm:flex-wrap items-center"
        }`}
      >
        <Popover
          open={autocomplete.open}
          onOpenChange={(o) => {
            if (!o) autocomplete.dismiss();
          }}
        >
          <PopoverAnchor asChild>
            <div className="relative min-w-0 flex-1">
              {inline ? (
                <CaptureField
                  value={value}
                  onChange={setValue}
                  onFocus={() => setIsFocused(true)}
                  onEnter={() => task.submit()}
                  placeholder={effectivePlaceholder}
                  autoFocus={autoFocus}
                  dimmed={!isFocused}
                  onKeyDown={handleKeyDown}
                  onTokenClick={setTokenEdit}
                  skipPriorityToken={task.priorityDetached}
                />
              ) : (
                <AutoGrowTextarea
                  value={value}
                  onChange={setValue}
                  onFocus={() => setIsFocused(true)}
                  onEnter={() => task.submit()}
                  dateMatch={task.dateMatch}
                  listMatch={task.listMatch}
                  tagMatches={task.tagMatches}
                  placeholder={effectivePlaceholder}
                  autoFocus={autoFocus}
                  onMultilineChange={setMultiline}
                  onKeyDown={handleKeyDown}
                />
              )}
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
            {autocomplete.items.map((item, i) => (
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
      </div>

      {/* Contrôles (date / priorité / liste). Enfant DIRECT du formulaire,
          pas de la colonne de texte : empiles, ils commencent ainsi au bord
          gauche, alignes sur le cercle. */}
      <AnimatePresence>
        {showControls &&
          (stackControls ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.16 },
              }}
              className="w-full shrink-0 basis-full overflow-hidden"
            >
              <div className="flex items-center gap-2 pt-2.5">{controls}</div>
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

      {/* Indice clavier : au repos seulement, et jamais par-dessus un
          brouillon (le bouton d'envoi occupe alors ce coin). */}
      {hint && !isFocused && !value.trim() && (
        <span className="flex h-6 shrink-0 items-center">{hint}</span>
      )}

      {/* Selecteur ouvert par un clic sur un jeton : ancre a l'endroit du mot
          plutot qu'au bouton — on modifie l'attribut la ou on le lit. */}
      <Popover
        open={tokenEdit !== null}
        onOpenChange={(o) => {
          if (!o) setTokenEdit(null);
        }}
      >
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={
              tokenEdit
                ? {
                    position: "fixed",
                    left: tokenEdit.rect.left,
                    top: tokenEdit.rect.bottom,
                    width: tokenEdit.rect.width,
                    height: 0,
                  }
                : { display: "none" }
            }
          />
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-auto p-0"
        >
          {tokenEdit?.kind === "date" && (
            <DatePickerCalendar
              date={task.dueDate}
              onPick={(next) => {
                task.handleDateChange(next);
                setTokenEdit(null);
                focusField();
              }}
            />
          )}
          {tokenEdit?.kind === "recurrence" && (
            <div className="flex w-48 flex-col gap-px p-1">
              {(
                [
                  { value: "daily", label: "Chaque jour", mot: "chaque jour" },
                  { value: "weekdays", label: "En semaine", mot: "en semaine" },
                  { value: "weekly", label: "Chaque semaine", mot: "chaque semaine" },
                  { value: "monthly", label: "Chaque mois", mot: "chaque mois" },
                  { value: "none", label: "Ne pas répéter", mot: "" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    // Ici on REECRIT le texte, contrairement a la priorite :
                    // « chaque lundi » est un complement circonstanciel, pas un
                    // adjectif accorde — le remplacer par « chaque mois » laisse
                    // la phrase debout.
                    if (task.recurrenceMatch) {
                      rewriteToken(task.recurrenceMatch, option.mot);
                    }
                    setTokenEdit(null);
                    focusField();
                  }}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    task.recurrence === option.value && "text-brand",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {tokenEdit?.kind === "priority" && (
            <div className="flex w-44 flex-col gap-px p-1">
              {(
                [
                  { value: "high", label: "Haute", color: "#ef4444" },
                  { value: "low", label: "Basse", color: "#10b981" },
                  { value: "normal", label: "Aucune", color: null },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    // On ne touche PAS au texte. « importante » est un adjectif
                    // accorde, pris dans la syntaxe de la phrase : le remplacer
                    // par « plus tard » donnait « tres plus tarde ». Le mot
                    // reste donc ou il est et cesse simplement d'etre
                    // l'attribut — la priorite devient un choix a part, et le
                    // bouton reprend la main.
                    task.setPriority(option.value);
                    setTokenEdit(null);
                    focusField();
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    task.priority === option.value && "text-brand",
                  )}
                >
                  {option.color ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                  ) : (
                    <span className="size-2.5 shrink-0 rounded-full border border-muted-foreground/50" />
                  )}
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {tokenEdit?.kind === "project" && (
            <div className="flex max-h-64 w-52 flex-col gap-px overflow-y-auto p-1">
              {(lists ?? []).length === 0 && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  Aucun projet
                </p>
              )}
              {(lists ?? []).map((name) => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (task.listMatch) rewriteToken(task.listMatch, `#${name}`);
                    setTokenEdit(null);
                    focusField();
                  }}
                  className={cn(
                    "truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    task.list?.toLowerCase() === name.toLowerCase() && "text-brand",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Bouton d'envoi rapide quand la barre n'est pas focus. */}
      <AnimatePresence>
        {!isFocused && value.trim() && (
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
