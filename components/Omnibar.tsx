"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DatePickerButton } from "@/components/date-picker-button";
import { Button } from "@/components/ui/button";
import { Plus, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/omnibar/AutoGrowTextarea";
import dynamic from "next/dynamic";
import type { TokenClick } from "@/components/omnibar/CaptureField";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
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

/**
 * L'editeur n'est charge QUE par les surfaces qui l'utilisent (variante
 * inline). En import statique, il pesait sur toute page important l'Omnibar :
 * la fenetre de capture rapide et l'Assistant payaient ~70 kB pour un champ
 * qu'ils n'affichent pas. `ssr: false` : Lexical touche au DOM au montage.
 */
const CaptureField = dynamic(
  () => import("@/components/omnibar/CaptureField").then((m) => m.CaptureField),
  {
    ssr: false,
    // Reserve la hauteur d'une ligne : sans lui, la rangee se replierait le
    // temps du chargement et le contenu sauterait.
    loading: () => <div className="min-h-6 w-full" />,
  },
);

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
  // Jeton designe a la souris : son selecteur s'ouvre a l'endroit du mot.
  const [tokenEdit, setTokenEdit] = useState<TokenClick | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isTask = mode === "task";
  const activeCommand = commandForMode(mode);
  const inline = variant === "inline";
  // Le cercle fantôme ne tient que dans le mode par défaut : dès qu'un mode
  // explicite est choisi, la pastille reprend sa place (c'est le signal).
  const showLeading = Boolean(leading) && mode === defaultMode;

  const focusField = () =>
    formRef.current
      ?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')
      ?.focus();

  const switchMode = (next: OmnibarMode) => {
    setMode(next);
    setValue("");
  };
  const clearMode = () => switchMode(defaultMode);

  // Logique du mode Tâche (contrôlée : le texte est détenu ici).
  const task = useTaskMode(value, setValue, onSubmit, lists ?? []);
  // Autocomplétion `#liste` (mode Tâche uniquement).
  const autocomplete = useListAutocomplete(value, setValue, lists ?? []);
  // Capacités RÉELLES de cette surface : déduites des callbacks câblés plutôt
  // que déclarées à part — impossible d'annoncer un mode qu'on ne traite pas.
  const availableModes = useMemo<OmnibarMode[]>(() => {
    const modes: OmnibarMode[] = ["task"];
    if (onSubmitNote) modes.push("note");
    if (onSubmitAsk) modes.push("ask");
    return modes;
  }, [onSubmitNote, onSubmitAsk]);

  // Menu de commandes « slash ».
  const slash = useSlashCommands({
    value,
    setValue,
    currentMode: mode,
    switchMode,
    availableModes,
  });

  // L'ancre du selecteur est figee aux coordonnees du clic : si la page
  // defile, elle ne suit pas. On referme plutot que de laisser un popover
  // flotter loin de son mot.
  useEffect(() => {
    if (!tokenEdit) return;
    const close = () => setTokenEdit(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [tokenEdit]);

  /** Remplace dans le texte le fragment reconnu par une nouvelle ecriture. */
  const rewriteToken = (match: { index: number; text: string }, next: string) => {
    setValue(
      value.slice(0, match.index) + next + value.slice(match.index + match.text.length),
    );
  };

  const handleChange = (raw: string) => {
    if (slash.interceptChange(raw)) return;
    setValue(raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
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
      (e.target as HTMLElement).blur();
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

  /**
   * Les contrôles passent-ils sous le texte ?
   *
   * En variante inline, la réponse ne dépend PAS de la largeur occupée : dès
   * qu'on écrit, ils descendent. Se fier à l'enroulement mesuré créait une
   * boucle — le texte s'allonge, pousse les contrôles à la ligne, ce qui
   * libère de la place, donc ils remontent, donc le texte les rejoint à
   * nouveau : ils faisaient l'aller-retour à chaque caractère.
   */
  const stackControls = inline
    ? isFocused && value.trim().length > 0
    : multiline;

  /**
   * En variante inline, les contrôles n'apparaissent qu'à partir du premier
   * caractère — ils sont donc toujours sur leur propre ligne, et peuvent
   * garder leur hauteur normale sans imposer la sienne à la rangée. C'est ce
   * qui permet d'avoir À LA FOIS des boutons de taille normale et aucun
   * décalage entre repos et focus : à vide, la rangée est identique dans les
   * deux états. (Sur un champ vide il n'y a de toute façon rien à dater ni à
   * ranger.) La variante flottante les montre dès le focus, comme avant.
   */
  const showControls =
    isTask && isFocused && (!inline || value.trim().length > 0);

  const menuOpen = slash.open || (isTask && autocomplete.open);

  // Un attribut deja ecrit dans le texte y est MODIFIABLE (on clique son
  // jeton) : afficher en plus son bouton le montrerait deux fois, sans dire
  // lequel fait foi. Le controle ne sert donc qu'a AJOUTER ce qui manque.
  // Reserve a la variante inline : ailleurs, les fragments ne sont pas
  // cliquables, retirer le bouton priverait de tout moyen de corriger.
  const tokenIsEditable = inline && isTask;
  const controls = (
    <>
      {!(tokenIsEditable && task.dateMatch) && (
        <DatePickerButton date={task.dueDate} onDateChange={task.handleDateChange} />
      )}
      {/* La priorite n'a pas de jeton : ses mots-cles restent des mots de la
          phrase. Son bouton est donc toujours la. */}
      <PrioritySelect value={task.priority} onChange={task.setPriority} />
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
              // Padding CONSTANT entre repos et focus : le texte ne bouge pas
              // d'un pixel, seule l'enveloppe s'ouvre. Fond TOUJOURS
              // transparent — donc rigoureusement la couleur de la page, voile
              // d'accent du canvas compris (un `bg-background` opaque le
              // masquerait et redessinerait une carte). Aucune ombre : au
              // focus, une simple hairline.
              // Le rayon est animé par motion (voir `animate`) et NON par une
              // classe : `layout` écrit lui-même un border-radius en style
              // inline pendant ses animations, qui écraserait un `rounded-*`.
              // `flex-wrap` en PERMANENCE, et non seulement quand les
              // controles sont empiles : ils portent `basis-full`, donc sans
              // enroulement ils reclament toute la largeur sans pouvoir passer
              // a la ligne — et ecrasent la colonne de texte. Cela arrivait
              // pendant les ~200 ms d'animation de sortie, quand la condition
              // etait deja retombee mais l'element encore monte : le
              // placeholder, prive de largeur, s'enroulait sur deux lignes
              // (mesure : colonne a 0 px, rangee a 62 px au lieu de 54).
              // Toujours enroulable, la rangee n'a qu'une ligne tant qu'il n'y
              // a rien a y mettre.
              "flex w-full flex-wrap items-start gap-x-3 bg-transparent px-3 py-3.5",
              "transition-[background-color,border-color] duration-300 ease-out",
              isFocused
                ? "border border-border/60"
                : "cursor-text border border-transparent hover:bg-foreground/[0.045]",
            )
          : cn(
              "flex w-full max-w-4xl items-stretch gap-2 rounded-2xl p-2",
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
      // `layout` anime la taille en appliquant un scale au conteneur, ce qui
      // ECRASE son contenu pendant la transition (mesure : scaleY 0.84, les
      // controles chevauchaient le texte). La rangee inline s'en passe : sa
      // hauteur suit le contenu, et l'ouverture est portee par les controles
      // eux-memes. La variante flottante le garde, son gabarit ne bouge pas.
      layout={!inline}
      animate={inline ? { borderRadius: isFocused ? 12 : 8 } : undefined}
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
          stackControls ? "flex-col" : "max-sm:flex-wrap items-center"
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
            {inline ? (
              // Variante inline : editeur Lexical, ou les fragments reconnus
              // sont de vrais noeuds (survolables, cliquables) au lieu d'un
              // calque peint sous un textarea transparent.
              <CaptureField
                value={value}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onEnter={handleSubmit}
                placeholder={effectivePlaceholder}
                autoFocus={autoFocus}
                dimmed={!isFocused}
                onKeyDown={handleKeyDown}
                onTokenClick={setTokenEdit}
              />
            ) : (
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

      </div>

      {/* Contrôles (date / priorité / liste) : mode Tâche uniquement. Enfant
          DIRECT du formulaire, pas de la colonne de texte : empiles, ils
          commencent ainsi au bord gauche, alignes sur le cercle. */}
      <AnimatePresence>
        {showControls &&
          (stackControls ? (
            <motion.div
              // C'est CETTE rangee qui s'ouvre et se referme, pas le
              // formulaire : sa hauteur commande celle de la barre, qui suit
              // donc en douceur sans qu'on ait a lui appliquer un `layout`
              // (celui-ci animait la taille par un scale qui ecrasait le
              // contenu — voir le commentaire du formulaire).
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.16 },
              }}
              // `basis-full` et non `w-full` : en flex, une largeur de 100 %
              // se fait encore comprimer par la colonne de texte (mesure :
              // largeur calculee 0). La base de flex, elle, reclame la ligne
              // entiere — l'element passe donc dessous, au bord gauche.
              className="w-full shrink-0 basis-full overflow-hidden"
            >
              {/* L'espacement vit A L'INTERIEUR du bloc anime : en `gap` du
                  formulaire ou en padding du bloc lui-meme, il resterait a
                  hauteur nulle et laisserait un residu qui sauterait au
                  demontage. */}
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
        <span className="flex shrink-0 items-center">{hint}</span>
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
