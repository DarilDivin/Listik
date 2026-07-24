"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BellRing, Calendar, Flag, FolderOpen, Hash, Repeat, Sunset, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deadlineCountdown, toLocalISODate, todayLocalISODate } from "@/lib/date";
import { DatePickerCalendar } from "@/components/date-picker-calendar";
import { TimePicker } from "@/components/ui/time-picker";
import { ProjectControl } from "@/components/todo/ProjectControl";
import { TagControl } from "@/components/todo/TagControl";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RECURRENCE_OPTIONS } from "@/features/todos/recurrence";
import { priorityRingColor } from "@/features/todos/priority";
import type {
  Priority,
  RecurMode,
  Recurrence,
  RecurWeekday,
  Todo,
  UpdateTodoInput,
} from "@/features/todos/types";

const WEEKDAY_OPTIONS: { value: RecurWeekday; label: string }[] = [
  { value: "mon", label: "lundi" },
  { value: "tue", label: "mardi" },
  { value: "wed", label: "mercredi" },
  { value: "thu", label: "jeudi" },
  { value: "fri", label: "vendredi" },
  { value: "sat", label: "samedi" },
  { value: "sun", label: "dimanche" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
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

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  /** Teinte le badge d'icône en accent (façon Things : l'icône « vit » avec
   *  la donnée) et lui fait un petit pop, comme la coche. Réservé aux lignes
   *  dont l'icône a un sens booléen clair (récurrence, rappel) — les autres
   *  gardent le badge neutre par défaut. */
  active?: boolean;
}

/** Ligne d'attribut : pastille d'icône + libellé à gauche, contrôle à droite. */
function DetailRow({ icon, label, children, active = false }: DetailRowProps) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-border/60 py-2 first:border-t-0">
      <motion.span
        animate={{ scale: active ? [1, 1.15, 1] : 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], times: [0, 0.4, 1] }}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-200",
          active ? "bg-brand-soft text-brand" : "bg-foreground/[0.06] text-muted-foreground",
        )}
      >
        {icon}
      </motion.span>
      <span className="flex-1 text-[0.9375rem] text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface TodoDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo: Todo;
  onUpdate: (payload: UpdateTodoInput) => void;
  onDelete: () => void;
}

/**
 * Formulaire complet d'une tâche, dans un panneau latéral (au lieu de l'ancienne
 * édition au clic directement dans la ligne) : titre, note, priorité, date,
 * liste, récurrence, rappel, suppression. La ligne de la liste (`TodoItem`)
 * reste ainsi purement d'affichage — sa structure ne bouge plus jamais au
 * survol ou en édition, seule source de la « saccade » précédente.
 *
 * Padding : `SheetContent` remis à plat (`p-0 gap-0`), chaque bande gère son
 * propre `px-5` — en-tête et pied clos par des hairlines, un seul rail
 * vertical pour le titre, la note, la priorité et les attributs.
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

  // Resynchronise à chaque ouverture (la tâche a pu changer côté serveur).
  useEffect(() => {
    if (open) {
      setTitle(todo.text);
      setNote(todo.note ?? "");
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
    const iso = next ? toLocalISODate(next) : null;
    onUpdate({ scheduled_for: iso });
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

  const handleDelete = () => {
    onOpenChange(false);
    onDelete();
  };

  // Échap / clic dehors : les champs n'émettent pas de blur au démontage —
  // on committe donc les brouillons AVANT de fermer, sinon l'édition est perdue.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      saveTitle();
      saveNote();
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center border-b border-border/60 px-5 py-4">
          <SheetTitle>Détails de la tâche</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Titre + note : un seul rail px-5, pas de bordure de champ. */}
          <div className="px-5 pt-5">
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

          {/* Priorité : segmented à pouce glissant, comme les autres groupes. */}
          <div className="px-5 pt-4 pb-5">
            <div className="inline-flex w-fit items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-[3px] dark:bg-foreground/[0.08]">
              {PRIORITIES.map(({ value, label }) => {
                const active = todo.priority === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdate({ priority: value })}
                    className={cn(
                      "relative rounded-[10px] px-3 py-1.5 text-[13px] transition-colors duration-200",
                      active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground/80",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-[10px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] dark:bg-accent dark:ring-white/[0.07]"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: priorityRingColor(value) }}
                      />
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attributs : rail px-5, hairlines internes. */}
          <div className="border-t border-border/60 px-5">
            <DetailRow icon={<Calendar size={15} />} label="Planifiée">
              {/* modal : dans un Dialog, un popover non modal se fait voler le
                  focus par le FocusScope du dialog (champ insaisissable). */}
              <Popover open={dateOpen} onOpenChange={setDateOpen} modal>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="font-normal">
                    {todo.scheduled_for ? formatShortDate(todo.scheduled_for) : "Choisir…"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  collisionPadding={8}
                  className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
                >
                  <DatePickerCalendar date={selectedDate} onPick={pickDate} />
                </PopoverContent>
              </Popover>
            </DetailRow>

            <DetailRow icon={<Sunset size={15} />} label="Ce soir">
              <Switch
                checked={todo.this_evening}
                onCheckedChange={toggleEvening}
                aria-label="Ranger dans Ce soir"
              />
            </DetailRow>

            <DetailRow icon={<Flag size={15} />} label="Échéance">
              <div className="flex items-center gap-1">
                <Popover open={deadlineOpen} onOpenChange={setDeadlineOpen} modal>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="font-normal">
                      {todo.due_date ? (
                        <span className="inline-flex items-center gap-1.5">
                          {formatShortDate(todo.due_date)}
                          <span
                            className={cn(
                              "font-mono text-[11px] tabular-nums",
                              deadlineCountdown(todo.due_date, todayLocalISODate())
                                .reached
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {
                              deadlineCountdown(todo.due_date, todayLocalISODate())
                                .label
                            }
                          </span>
                        </span>
                      ) : (
                        "Choisir…"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="end"
                    collisionPadding={8}
                    className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
                  >
                    <DatePickerCalendar date={selectedDeadline} onPick={pickDeadline} />
                  </PopoverContent>
                </Popover>
                {todo.due_date && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Retirer l'échéance"
                    onClick={() => onUpdate({ due_date: null })}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </DetailRow>

            <DetailRow icon={<FolderOpen size={15} />} label="Projet">
              <ProjectControl
                projectId={todo.project_id}
                projects={projects}
                areas={areas}
                modal
                // Purge la « liste » héritée en même temps : le projet devient
                // l'unique source de vérité pour cette tâche (la colonne `list`
                // se vide ainsi progressivement, sans migration brutale).
                onChange={(project_id) => onUpdate({ project_id, list: null })}
                onCreate={async (name) => (await createProject({ name })).id}
              />
            </DetailRow>

            <DetailRow icon={<Hash size={15} />} label="Tags">
              <TagControl
                value={todo.tags}
                tags={tags}
                modal
                onChange={(tagIds) => void setTodoTags(todo.id, tagIds)}
                onCreate={async (name) => (await createTag({ name })).id}
              />
            </DetailRow>

            <DetailRow
              icon={<Repeat size={15} />}
              label="Répéter"
              active={todo.recurrence !== "none"}
            >
              <Select
                value={todo.recurrence}
                onValueChange={(value) => {
                  const recurrence = value as Recurrence;
                  // Changer de fréquence normalise les modificateurs : ce qui
                  // n'a pas de sens pour la nouvelle fréquence est remis à zéro.
                  if (recurrence === "none" || recurrence === "weekdays") {
                    onUpdate({
                      recurrence,
                      recur_interval: 1,
                      recur_weekday: null,
                      recur_setpos: null,
                      recur_mode: "fixed",
                    });
                  } else if (recurrence !== "monthly") {
                    onUpdate({ recurrence, recur_weekday: null, recur_setpos: null });
                  } else {
                    onUpdate({ recurrence });
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DetailRow>

            {/* Intervalle « toutes les N » — pas pour les jours ouvrés
                (« un ouvré sur deux » ne veut rien dire). */}
            {["daily", "weekly", "monthly"].includes(todo.recurrence) &&
              todo.recur_setpos === null && (
                <DetailRow icon={<Repeat size={15} className="opacity-0" />} label="Intervalle">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {todo.recurrence === "daily"
                        ? "tous les"
                        : todo.recurrence === "weekly"
                          ? "toutes les"
                          : "tous les"}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={Number(todo.recur_interval)}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                        onUpdate({ recur_interval: n });
                      }}
                      className="h-8 w-16 text-center"
                      aria-label="Intervalle de répétition"
                    />
                    <span className="text-sm text-muted-foreground">
                      {todo.recurrence === "daily"
                        ? "jours"
                        : todo.recurrence === "weekly"
                          ? "semaines"
                          : "mois"}
                    </span>
                  </div>
                </DetailRow>
              )}

            {/* Positionnel mensuel : jour d'ancrage / Ne jour de semaine /
                dernier jour du mois. */}
            {todo.recurrence === "monthly" && (
              <DetailRow icon={<Repeat size={15} className="opacity-0" />} label="Le">
                <div className="flex items-center gap-1.5">
                  <Select
                    value={
                      todo.recur_setpos === null
                        ? "anchor"
                        : todo.recur_weekday === null
                          ? "lastday"
                          : String(todo.recur_setpos)
                    }
                    onValueChange={(value) => {
                      if (value === "anchor") {
                        onUpdate({ recur_setpos: null, recur_weekday: null });
                      } else if (value === "lastday") {
                        onUpdate({ recur_setpos: -1, recur_weekday: null });
                      } else {
                        // Positionnel → mode fixe forcé : « le prochain 1er
                        // lundi au moins N mois après complétion » n'est un
                        // planning pour personne.
                        onUpdate({
                          recur_setpos: Number(value),
                          recur_weekday: todo.recur_weekday ?? "mon",
                          recur_mode: "fixed",
                        });
                      }
                    }}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="anchor">Jour d&apos;ancrage</SelectItem>
                      <SelectItem value="1">1er</SelectItem>
                      <SelectItem value="2">2e</SelectItem>
                      <SelectItem value="3">3e</SelectItem>
                      <SelectItem value="4">4e</SelectItem>
                      <SelectItem value="-1">Dernier</SelectItem>
                      <SelectItem value="lastday">Dernier jour du mois</SelectItem>
                    </SelectContent>
                  </Select>

                  {todo.recur_setpos !== null && todo.recur_weekday !== null && (
                    <Select
                      value={todo.recur_weekday}
                      onValueChange={(value) =>
                        onUpdate({ recur_weekday: value as RecurWeekday })
                      }
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {WEEKDAY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </DetailRow>
            )}

            {/* Base du report : date fixe ou après complétion — réservé aux
                règles simples (façon Things). */}
            {["daily", "weekly", "monthly"].includes(todo.recurrence) &&
              todo.recur_setpos === null && (
                <DetailRow icon={<Repeat size={15} className="opacity-0" />} label="À partir de">
                  <Select
                    value={todo.recur_mode}
                    onValueChange={(value) =>
                      onUpdate({ recur_mode: value as RecurMode })
                    }
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="fixed">La date planifiée</SelectItem>
                      <SelectItem value="after_completion">La complétion</SelectItem>
                    </SelectContent>
                  </Select>
                </DetailRow>
              )}

            <DetailRow
              icon={<BellRing size={15} />}
              label="Rappel"
              active={todo.remind_at !== null}
            >
              <div className="flex items-center gap-1">
                <Popover open={reminderOpen} onOpenChange={setReminderOpen} modal>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="font-normal">
                      {todo.remind_at
                        ? `${formatShortDate(remindDatePart)} · ${remindTimePart}`
                        : "Ajouter…"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="end"
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Retirer le rappel"
                    onClick={clearReminder}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </DetailRow>
          </div>
        </div>

        {/* Pied : suppression, séparée par une hairline. */}
        <div className="border-t border-border/60 px-5 py-4">
          <Button
            variant="ghost"
            className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 />
            Supprimer la tâche
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
