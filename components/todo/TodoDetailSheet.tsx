"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  Calendar,
  Flag,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Repeat,
  Sunset,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { deadlineCountdown, toLocalISODate, todayLocalISODate } from "@/lib/date";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import { TimePicker } from "@/components/ui/time-picker";
import { ProjectControl } from "@/components/todo/ProjectControl";
import { TagControl } from "@/components/todo/TagControl";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  parseWeekdays,
  recurrenceLabel,
  serializeWeekdays,
  toggleWeekday,
} from "@/features/todos/recurrence";
import { priorityRingColor } from "@/features/todos/priority";
import type {
  Priority,
  RecurMode,
  Recurrence,
  RecurWeekday,
  Todo,
  UpdateTodoInput,
} from "@/features/todos/types";

// `short` reprend l'abréviation du calendrier (`cccccc` en fr) : un jour porte
// le même nom partout dans l'app. On évite « L M M J V S D », où mardi et
// mercredi se confondent.
const WEEKDAY_OPTIONS: { value: RecurWeekday; label: string; short: string }[] = [
  { value: "mon", label: "lundi", short: "lu" },
  { value: "tue", label: "mardi", short: "ma" },
  { value: "wed", label: "mercredi", short: "me" },
  { value: "thu", label: "jeudi", short: "je" },
  { value: "fri", label: "vendredi", short: "ve" },
  { value: "sat", label: "samedi", short: "sa" },
  { value: "sun", label: "dimanche", short: "di" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
];

const FREQUENCIES: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Jamais" },
  { value: "daily", label: "Tous les jours" },
  { value: "weekdays", label: "Jours ouvrés" },
  { value: "weekly", label: "Toutes les semaines" },
  { value: "monthly", label: "Tous les mois" },
];

const DEFAULT_REMINDER_TIME = "09:00";

function parseLocalISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(date: string): string {
  return parseLocalISODate(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Un mot de la phrase qui s'ouvre au clic. La FORME (`token-affordance`) est
 * partagée avec les jetons de la barre de capture — même geste, même pastille
 * posée dans le texte. La TEINTE, elle, est l'accent de l'utilisateur : ici on
 * surligne l'éditabilité, pas le type de fragment, donc une seule couleur
 * suffit. Voir le bloc jeton de `globals.css`.
 *
 * Un jeton encore vide (« Choisir une date… ») reste en gris : peindre en
 * accent un mot qui ne dit rien encore le ferait passer pour une valeur.
 */
function Tok({
  children,
  muted = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { muted?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "token-affordance text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        muted
          ? "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.1]"
          : "token-affordance-accent text-brand",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * « Ce soir » n'a pas de valeur à choisir : son seul réglage est de partir.
 * Il ouvre quand même un menu, au lieu de disparaître au premier clic — un
 * jeton OUVRE, il ne détruit pas. Sans ça, c'était le seul geste irréversible
 * du panneau, déclenché par le même clic que celui qui ouvre un calendrier
 * ailleurs.
 */
function EveningToken({
  open,
  onOpenChange,
  onRemove,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <Tok>{children}</Tok>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-52 p-1">
        <button
          type="button"
          onClick={onRemove}
          className="flex w-full items-center rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
        >
          Retirer « ce soir »
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Une ligne de fait : icône nue + contenu. Pas de colonne de libellés — la
 * valeur dit déjà ce qu'elle est. Le mot ne survit que là où il lèverait une
 * ambiguïté (une échéance est une date, comme la date planifiée).
 *
 * Motion : la ligne S'OUVRE et se referme en hauteur, façon « chrome
 * escamotable » du §3 — jamais par démontage sec. C'est ce qui raconte que le
 * panneau grandit avec la tâche.
 *
 * La hauteur, et pas une translation : `MotionConfig reducedMotion="user"`
 * (layout racine) coupe les animations de TRANSFORM et de LAYOUT dès que le
 * système demande moins de mouvement — sous Windows, un simple réglage
 * d'accessibilité. Un `y` ou un `layout` n'y survivrait pas, une hauteur si.
 * Et les voisines suivent par le flux normal, sans rien avoir à animer.
 */
function Fact({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring.smooth}
      className="overflow-hidden"
    >
      <div className="flex items-start gap-3 py-1.5">
        <span className="mt-1 flex shrink-0 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
}

/**
 * Priorité : l'anneau de la case à cocher, posé devant le titre. Dans la liste,
 * cette couleur EST déjà celle de l'anneau de la coche (`priorityRingColor`) —
 * le panneau lui donne enfin un nom au lieu d'en faire un code secret.
 *
 * La cible fait 28 px pour le pointeur ; l'anneau n'en fait que 20, par
 * remplissage. C'est le seul chemin vers la priorité, il ne peut pas être plus
 * petit que le minimum d'une cible.
 */
function PriorityRing({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange: (next: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = PRIORITIES.find((p) => p.value === priority)?.label ?? "Normale";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Priorité : ${label}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="size-5 rounded-full border-2 transition-colors duration-200"
                style={{ borderColor: priorityRingColor(priority) }}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {/* Sans l'infobulle, rien ne dit qu'un anneau s'ouvre : c'est le prix
            assumé de ce traitement, et il se paie ici. */}
        <TooltipContent side="bottom">Priorité : {label}</TooltipContent>
      </Tooltip>

      <PopoverContent side="bottom" align="start" className="w-44 p-1">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              onChange(p.value);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
              p.value === priority && "font-medium",
            )}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: priorityRingColor(p.value) }}
            />
            {p.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Bouton d'une grille de choix, dans l'éditeur de répétition. */
function GridChoice({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg px-2 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-brand font-medium text-brand-foreground"
          : "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Tout le rythme dans UN popover, contextuel : on n'y voit que ce qui
 * s'applique à la fréquence choisie. Il remplace à lui seul les quatre rangées
 * « Répéter / Intervalle / Le / À partir de » de l'ancien formulaire.
 *
 * Que des boutons : un `Select` Radix ici ferait une TROISIÈME pile de
 * `FocusScope` (Sheet → Popover → Select), et le §4.4 du design system raconte
 * déjà ce que coûtent deux piles.
 */
function RecurrenceEditor({
  todo,
  onUpdate,
}: {
  todo: Todo;
  onUpdate: (payload: UpdateTodoInput) => void;
}) {
  const weekdaySet = parseWeekdays(todo.recur_weekdays);
  const positional = todo.recurrence === "monthly" && todo.recur_setpos !== null;
  // L'intervalle n'a de sens ni avec un ensemble de jours ni en positionnel :
  // « un lundi sur deux et un jeudi sur deux » n'a pas de lecture unique
  // (migration 0015), et le positionnel force déjà le mode fixe.
  const intervalApplies =
    ["daily", "weekly", "monthly"].includes(todo.recurrence) &&
    weekdaySet.length === 0 &&
    !positional;
  const modeApplies =
    ["daily", "weekly", "monthly"].includes(todo.recurrence) && !positional;

  const unit =
    todo.recurrence === "daily"
      ? "jour"
      : todo.recurrence === "weekly"
        ? "semaine"
        : "mois";
  const interval = Math.max(1, Number(todo.recur_interval));
  const plural = interval > 1 && unit !== "mois" ? `${unit}s` : unit;

  const setFrequency = (recurrence: Recurrence) => {
    // Changer de fréquence normalise les modificateurs : ce qui n'a pas de
    // sens pour la nouvelle fréquence est remis à zéro.
    if (recurrence === "none" || recurrence === "weekdays") {
      onUpdate({
        recurrence,
        recur_interval: 1,
        recur_weekday: null,
        recur_weekdays: null,
        recur_setpos: null,
        recur_mode: "fixed",
      });
    } else {
      onUpdate({
        recurrence,
        recur_weekday: null,
        recur_weekdays: null,
        recur_setpos: null,
      });
    }
  };

  const positionalValue = !positional
    ? "anchor"
    : todo.recur_weekday === null
      ? "lastday"
      : String(todo.recur_setpos);

  return (
    <div className="flex flex-col py-1">
      <div className="px-1">
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFrequency(f.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
              f.value === todo.recurrence && "font-medium text-brand",
            )}
          >
            {f.label}
            {f.value === todo.recurrence && <span aria-hidden>✓</span>}
          </button>
        ))}
      </div>

      {todo.recurrence === "weekly" && (
        <>
          <div className="my-1 h-px bg-border" />
          <span className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Certains jours
          </span>
          <div className="grid grid-cols-7 gap-[3px] px-2 pb-1">
            {WEEKDAY_OPTIONS.map((d) => (
              <GridChoice
                key={d.value}
                active={weekdaySet.includes(d.value)}
                aria-pressed={weekdaySet.includes(d.value)}
                aria-label={d.label}
                onClick={() =>
                  onUpdate({
                    recur_weekdays: serializeWeekdays(
                      toggleWeekday(weekdaySet, d.value),
                    ),
                  })
                }
                className="px-0 text-xs"
              >
                {d.short}
              </GridChoice>
            ))}
          </div>
        </>
      )}

      {todo.recurrence === "monthly" && (
        <>
          <div className="my-1 h-px bg-border" />
          <span className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Le
          </span>
          <div className="grid grid-cols-2 gap-[3px] px-2 pb-1">
            <GridChoice
              active={positionalValue === "anchor"}
              onClick={() => onUpdate({ recur_setpos: null, recur_weekday: null })}
              className="col-span-2"
            >
              Jour d&apos;ancrage
            </GridChoice>
            {[
              { v: 1, l: "1er" },
              { v: 2, l: "2e" },
              { v: 3, l: "3e" },
              { v: 4, l: "4e" },
              { v: -1, l: "Dernier" },
            ].map((o) => (
              <GridChoice
                key={o.v}
                active={positionalValue === String(o.v)}
                onClick={() =>
                  // Positionnel → mode fixe forcé : « le prochain 1er lundi au
                  // moins N mois après complétion » n'est un planning pour
                  // personne.
                  onUpdate({
                    recur_setpos: o.v,
                    recur_weekday: todo.recur_weekday ?? "mon",
                    recur_mode: "fixed",
                  })
                }
              >
                {o.l}
              </GridChoice>
            ))}
            <GridChoice
              active={positionalValue === "lastday"}
              onClick={() =>
                onUpdate({ recur_setpos: -1, recur_weekday: null, recur_mode: "fixed" })
              }
            >
              Dernier jour
            </GridChoice>
          </div>

          {positional && todo.recur_weekday !== null && (
            <div className="grid grid-cols-7 gap-[3px] px-2 pb-1">
              {WEEKDAY_OPTIONS.map((d) => (
                <GridChoice
                  key={d.value}
                  active={todo.recur_weekday === d.value}
                  aria-label={d.label}
                  onClick={() => onUpdate({ recur_weekday: d.value })}
                  className="px-0 text-xs"
                >
                  {d.short}
                </GridChoice>
              ))}
            </div>
          )}
        </>
      )}

      {intervalApplies && (
        <>
          <div className="my-1 h-px bg-border" />
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
            <span>{todo.recurrence === "weekly" ? "toutes les" : "tous les"}</span>
            <span className="inline-flex items-center overflow-hidden rounded-md border border-border">
              <button
                type="button"
                aria-label="Diminuer l'intervalle"
                onClick={() => onUpdate({ recur_interval: Math.max(1, interval - 1) })}
                className="flex size-7 items-center justify-center text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                −
              </button>
              <span className="min-w-8 border-x border-border py-1 text-center font-mono text-[13px] tabular-nums text-foreground">
                {interval}
              </span>
              <button
                type="button"
                aria-label="Augmenter l'intervalle"
                onClick={() => onUpdate({ recur_interval: Math.min(99, interval + 1) })}
                className="flex size-7 items-center justify-center text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                +
              </button>
            </span>
            <span>{plural}</span>
          </div>
        </>
      )}

      {modeApplies && (
        <>
          <div className="my-1 h-px bg-border" />
          <span className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            À partir de
          </span>
          <div className="px-1 pb-1">
            {(
              [
                { v: "fixed", l: "La date planifiée" },
                { v: "after_completion", l: "La complétion" },
              ] as { v: RecurMode; l: string }[]
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => onUpdate({ recur_mode: o.v })}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                  todo.recur_mode === o.v && "font-medium text-brand",
                )}
              >
                {o.l}
                {todo.recur_mode === o.v && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Attributs que le panneau sait porter, dans l'ordre où ils se lisent. */
type AttrKey =
  | "scheduled"
  | "evening"
  | "deadline"
  | "recurrence"
  | "project"
  | "tags"
  | "remind";

const MISSING_LABELS: Record<AttrKey, string> = {
  scheduled: "Une date",
  evening: "Ce soir",
  deadline: "Une échéance",
  recurrence: "Une répétition",
  project: "Un projet",
  tags: "Un tag",
  remind: "Un rappel",
};

interface TodoDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo: Todo;
  onUpdate: (payload: UpdateTodoInput) => void;
  onDelete: () => void;
}

/**
 * Panneau de détail d'une tâche : il montre LA TÂCHE, pas le schéma d'une
 * tâche. Un attribut vide n'occupe pas de ligne ; ce qui est posé se lit comme
 * une phrase dont les mots s'ouvrent au clic, exactement comme dans la barre
 * de capture. Ce qui manque s'ajoute par une seule porte, « Ajouter ».
 *
 * Padding : `SheetContent` remis à plat (`p-0 gap-0`), chaque bande gère son
 * propre `px-5` et est close par une hairline. Titre et note restent sur un
 * unique rail, avec l'anneau de priorité devant eux.
 */
export function TodoDetailSheet({
  open,
  onOpenChange,
  todo,
  onUpdate,
  onDelete,
}: TodoDetailSheetProps) {
  const { projects, areas, createProject } = useProjects();
  const { tags, createTag, setTodoTags } = useTags();
  const [title, setTitle] = useState(todo.text);
  const [note, setNote] = useState(todo.note ?? "");
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [recurOpen, setRecurOpen] = useState(false);
  const [eveningOpen, setEveningOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /**
   * Attributs révélés à la demande : pas encore de valeur, mais l'utilisateur
   * vient de les demander par « Ajouter ». On n'écrit PAS de valeur par défaut
   * en base pour ça — un panneau ne doit pas inventer une échéance parce qu'on
   * a cliqué « Une échéance ».
   */
  const [revealed, setRevealed] = useState<AttrKey[]>([]);

  // Resynchronise à chaque ouverture (la tâche a pu changer côté serveur).
  useEffect(() => {
    if (open) {
      setTitle(todo.text);
      setNote(todo.note ?? "");
      setRevealed([]);
    }
  }, [open, todo.text, todo.note]);

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== todo.text) onUpdate({ text: next });
    else setTitle(todo.text);
  };

  const saveNote = () => {
    const next = note.trim();
    if (next !== (todo.note ?? "")) onUpdate({ note: next || null });
  };

  const selectedDate = todo.scheduled_for ? parseLocalISODate(todo.scheduled_for) : null;
  // Planifiée (« quand je m'y mets ») et Échéance (« pour quand ») sont deux
  // dates DISTINCTES depuis la Phase I — plus jamais écrites ensemble.
  const pickDate = (next: Date | undefined) => {
    onUpdate({ scheduled_for: next ? toLocalISODate(next) : null });
    setDateOpen(false);
  };

  const selectedDeadline = todo.due_date ? parseLocalISODate(todo.due_date) : null;
  const pickDeadline = (next: Date | undefined) => {
    onUpdate({ due_date: next ? toLocalISODate(next) : null });
    setDeadlineOpen(false);
  };

  // Activer « Ce soir » sur une tâche non planifiée aujourd'hui l'y planifie
  // (façon Things : « ce soir » = le soir d'aujourd'hui, pas un soir abstrait).
  const toggleEvening = (on: boolean) => {
    const today = todayLocalISODate();
    onUpdate(
      on && todo.scheduled_for !== today
        ? { this_evening: true, scheduled_for: today }
        : { this_evening: on },
    );
  };

  const remindDatePart = todo.remind_at
    ? todo.remind_at.slice(0, 10)
    : todo.scheduled_for ?? todayLocalISODate();
  const remindTimePart = todo.remind_at ? todo.remind_at.slice(11, 16) : DEFAULT_REMINDER_TIME;
  const setReminder = (date: string, time: string) => onUpdate({ remind_at: `${date}T${time}` });
  const clearReminder = () => {
    onUpdate({ remind_at: null });
    setReminderOpen(false);
  };

  // Échap / clic dehors / ✕ : les champs n'émettent pas de blur au démontage —
  // on committe donc les brouillons AVANT de fermer, sinon l'édition est
  // perdue. TOUTE fermeture passe par ici, la suppression comprise.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      saveTitle();
      saveNote();
    }
    onOpenChange(next);
  };

  const handleDelete = () => {
    handleOpenChange(false);
    onDelete();
  };

  const has = (key: AttrKey): boolean => {
    switch (key) {
      case "scheduled":
        return todo.scheduled_for !== null;
      case "evening":
        return todo.this_evening;
      case "deadline":
        return todo.due_date !== null;
      case "recurrence":
        return todo.recurrence !== "none";
      case "project":
        return todo.project_id !== null;
      case "tags":
        return todo.tags.length > 0;
      case "remind":
        return todo.remind_at !== null;
    }
  };
  const shows = (key: AttrKey) => has(key) || revealed.includes(key);
  const reveal = (key: AttrKey) =>
    setRevealed((prev) => (prev.includes(key) ? prev : [...prev, key]));

  const missing = (Object.keys(MISSING_LABELS) as AttrKey[]).filter((k) => !shows(k));

  const deadlineInfo = todo.due_date
    ? deadlineCountdown(todo.due_date, todayLocalISODate())
    : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* `showCloseButton={false}` : le ✕ maison de `SheetContent` est en
          `absolute top-4 right-4`, donc aligné sur le haut du panneau et pas
          sur la rangée d'en-tête — il flottait au-dessus du titre et du ⋯. On
          le remet dans le flux, à côté du ⋯, où le centrage vertical de la
          rangée s'occupe de lui. */}
      <SheetContent
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border/60 py-3.5 pl-5 pr-3.5">
          <SheetTitle>Détails de la tâche</SheetTitle>
          <div className="flex items-center gap-0.5">
            {/* La suppression est rare : elle ne mérite pas une barre rouge
                permanente en pied de panneau. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Autres actions">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
                  <Trash2 />
                  Supprimer la tâche
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fermer">
                <X size={16} />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Anneau + titre + note : un seul rail px-5, pas de bordure de champ. */}
          <div className="flex gap-3 px-5 pt-5">
            <div className="pt-0.5">
              <PriorityRing
                priority={todo.priority}
                onChange={(priority) => onUpdate({ priority })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <textarea
                value={title}
                rows={1}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                placeholder="Titre de la tâche"
                className="w-full resize-none bg-transparent text-lg font-semibold tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground/50 field-sizing-content"
              />
              {/* textarea nu (pas le Textarea shadcn : son `dark:bg-input/30`
                  survivrait au bg-transparent et dessinerait une boîte teintée). */}
              <textarea
                value={note}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                onBlur={saveNote}
                placeholder="Ajouter une note…"
                className="mt-1.5 w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50 field-sizing-content"
              />
            </div>
          </div>

          {/* Les faits : ce que la tâche PORTE, rien d'autre.

              Pas de hairline avant ce bloc. Elle venait de l'ancien
              formulaire, où elle séparait la priorité des attributs — deux
              sections de nature différente. Ici le titre, la note et les faits
              sont une seule chose, le portrait de la tâche : la règle ne
              séparerait plus rien, et l'en-tête en pose déjà une. Ce sont les
              icônes en gouttière qui distinguent un fait du titre. */}
          <div className="mt-4 flex flex-col px-5 pb-4">
            {/* `initial={false}` : à l'ouverture, la seule animation est le
                glissement du panneau lui-même. Un moment, une animation — une
                cascade jouée sous le glissement ne ferait que brouiller les
                deux. Ce qui s'anime ici, c'est ce que l'utilisateur PROVOQUE :
                ajouter ou retirer un fait. */}
            <AnimatePresence initial={false}>
            {shows("scheduled") && (
              <Fact key="scheduled" icon={<Calendar size={15} />}>
                {/* modal : dans un Dialog, un popover non modal se fait voler le
                    focus par le FocusScope du dialog (champ insaisissable). */}
                <Popover open={dateOpen} onOpenChange={setDateOpen} modal>
                  <PopoverTrigger asChild>
                    <Tok muted={!todo.scheduled_for}>
                      {todo.scheduled_for
                        ? formatShortDate(todo.scheduled_for)
                        : "Choisir une date…"}
                    </Tok>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    collisionPadding={8}
                    className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
                  >
                    <DatePickerCalendar date={selectedDate} onPick={pickDate} />
                  </PopoverContent>
                </Popover>
                {todo.this_evening && (
                  <>
                    <span className="text-muted-foreground">, </span>
                    <EveningToken
                      open={eveningOpen}
                      onOpenChange={setEveningOpen}
                      onRemove={() => {
                        toggleEvening(false);
                        setEveningOpen(false);
                      }}
                    >
                      ce soir
                    </EveningToken>
                  </>
                )}
              </Fact>
            )}

            {/* « Ce soir » sans date planifiée : possible sur une donnée
                ancienne, on ne l'escamote pas pour autant. */}
            {!shows("scheduled") && shows("evening") && (
              <Fact key="evening" icon={<Sunset size={15} />}>
                <EveningToken
                  open={eveningOpen}
                  onOpenChange={setEveningOpen}
                  onRemove={() => {
                    toggleEvening(false);
                    setEveningOpen(false);
                  }}
                >
                  Ce soir
                </EveningToken>
              </Fact>
            )}

            {shows("deadline") && (
              <Fact key="deadline" icon={<Flag size={15} />}>
                <span className="text-muted-foreground">Échéance </span>
                <Popover open={deadlineOpen} onOpenChange={setDeadlineOpen} modal>
                  <PopoverTrigger asChild>
                    <Tok muted={!todo.due_date}>
                      {todo.due_date ? formatShortDate(todo.due_date) : "Choisir une date…"}
                    </Tok>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    collisionPadding={8}
                    className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
                  >
                    <DatePickerCalendar date={selectedDeadline} onPick={pickDeadline} />
                  </PopoverContent>
                </Popover>
                {deadlineInfo && (
                  <span
                    className={cn(
                      "ml-1.5 text-[11px] tabular-nums",
                      deadlineInfo.reached ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {deadlineInfo.label}
                  </span>
                )}
              </Fact>
            )}

            {shows("recurrence") && (
              <Fact key="recurrence" icon={<Repeat size={15} />}>
                {/* Le libellé vient de `recurrenceLabel` : c'est la MÊME chaîne
                    que la ligne méta de la liste. Deux formulations pour une
                    seule règle, c'est une divergence en attente. */}
                <Popover open={recurOpen} onOpenChange={setRecurOpen} modal>
                  <PopoverTrigger asChild>
                    <Tok muted={todo.recurrence === "none"}>
                      {todo.recurrence === "none"
                        ? "Choisir un rythme…"
                        : recurrenceLabel(todo)}
                    </Tok>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    collisionPadding={8}
                    className="max-h-[var(--radix-popover-content-available-height)] w-64 overflow-y-auto p-0"
                  >
                    <RecurrenceEditor todo={todo} onUpdate={onUpdate} />
                  </PopoverContent>
                </Popover>
              </Fact>
            )}

            {(shows("project") || shows("tags")) && (
              <Fact key="placement" icon={<FolderOpen size={15} />}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {shows("project") && (
                    <ProjectControl
                      projectId={todo.project_id}
                      projects={projects}
                      areas={areas}
                      modal
                      compact
                      // Purge la « liste » héritée en même temps : le projet
                      // devient l'unique source de vérité pour cette tâche (la
                      // colonne `list` se vide ainsi progressivement, sans
                      // migration brutale).
                      onChange={(project_id) => onUpdate({ project_id, list: null })}
                      onCreate={async (name) => (await createProject({ name })).id}
                    />
                  )}
                  {shows("tags") && (
                    <TagControl
                      value={todo.tags}
                      tags={tags}
                      modal
                      compact
                      onChange={(tagIds) => void setTodoTags(todo.id, tagIds)}
                      onCreate={async (name) => (await createTag({ name })).id}
                    />
                  )}
                </span>
              </Fact>
            )}

            {shows("remind") && (
              <Fact key="remind" icon={<BellRing size={15} />}>
                <span className="text-muted-foreground">Rappel </span>
                <Popover open={reminderOpen} onOpenChange={setReminderOpen} modal>
                  <PopoverTrigger asChild>
                    <Tok muted={!todo.remind_at}>
                      {todo.remind_at
                        ? `${formatShortDate(remindDatePart)} · ${remindTimePart}`
                        : "Choisir une heure…"}
                    </Tok>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    collisionPadding={8}
                    className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto p-0"
                  >
                    <div className="border-b border-border p-2.5">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Heure du rappel
                      </span>
                      <TimePicker
                        value={remindTimePart}
                        onChange={(time) => setReminder(remindDatePart, time)}
                      />
                    </div>
                    <DatePickerCalendar
                      date={todo.remind_at ? parseLocalISODate(remindDatePart) : null}
                      onPick={(next) => next && setReminder(toLocalISODate(next), remindTimePart)}
                    />
                  </PopoverContent>
                </Popover>
                {todo.remind_at && (
                  <button
                    type="button"
                    onClick={clearReminder}
                    className="ml-1.5 text-[11px] text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
                  >
                    retirer
                  </button>
                )}
              </Fact>
            )}

            </AnimatePresence>

            {/* La seule porte vers ce que la tâche n'a pas encore. Rien à
                animer : la hauteur de la ligne au-dessus bouge dans le flux,
                le bouton suit tout seul. */}
            {missing.length > 0 && (
              <Popover open={addOpen} onOpenChange={setAddOpen} modal>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="-ml-2 mt-1 inline-flex w-fit items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.9375rem] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus size={15} />
                    Ajouter
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-0">
                  <Command>
                    <CommandList>
                      <CommandEmpty>Tout est déjà posé.</CommandEmpty>
                      <CommandGroup>
                        {missing.map((key) => (
                          <CommandItem
                            key={key}
                            value={MISSING_LABELS[key]}
                            onSelect={() => {
                              // « Ce soir » n'a pas de valeur à saisir : il
                              // s'applique tout de suite, avec son effet de
                              // bord (planifier à aujourd'hui).
                              if (key === "evening") toggleEvening(true);
                              else reveal(key);
                              setAddOpen(false);
                            }}
                          >
                            {MISSING_LABELS[key]}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
