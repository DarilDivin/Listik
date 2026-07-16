"use client";

import { useEffect, useState } from "react";
import { BellRing, Calendar, FolderOpen, Hash, Repeat, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalISODate, todayLocalISODate } from "@/lib/date";
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
import { RECURRENCE_OPTIONS } from "@/features/todos/recurrence";
import { priorityRingColor } from "@/features/todos/priority";
import type { Priority, Recurrence, Todo, UpdateTodoInput } from "@/features/todos/types";

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
}

/** Ligne d'attribut : pastille d'icône + libellé à gauche, contrôle à droite. */
function DetailRow({ icon, label, children }: DetailRowProps) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-border/60 py-2 first:border-t-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-foreground/[0.06] text-muted-foreground">
        {icon}
      </span>
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
  const pickDate = (next: Date | undefined) => {
    const iso = next ? toLocalISODate(next) : null;
    onUpdate({ scheduled_for: iso, due_date: iso });
    setDateOpen(false);
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

            <DetailRow icon={<Repeat size={15} />} label="Répéter">
              <Select
                value={todo.recurrence}
                onValueChange={(value) => onUpdate({ recurrence: value as Recurrence })}
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

            <DetailRow icon={<BellRing size={15} />} label="Rappel">
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
