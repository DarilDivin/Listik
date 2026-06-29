"use client";

import { useState } from "react";
import { DatePickerButton } from "@/components/date-picker-button";
import { Button } from "@/components/ui/button";
import { Plus, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { AutoGrowTextarea } from "@/components/smart-input/AutoGrowTextarea";
import { PrioritySelect } from "@/components/smart-input/PrioritySelect";
import { ListControl } from "@/components/todo/ListControl";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  useSmartTaskInput,
  type SmartTaskData,
} from "@/features/todos/useSmartTaskInput";
import { useListAutocomplete } from "@/features/todos/useListAutocomplete";

interface SmartTaskInputProps {
  onSubmit: (taskData: SmartTaskData) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Si fourni, affiche un sélecteur de liste (avec ces suggestions). */
  lists?: string[];
}

export default function SmartTaskInput({
  onSubmit,
  placeholder = "Ajouter une tâche",
  autoFocus,
  lists,
}: SmartTaskInputProps) {
  const {
    task,
    setTask,
    dueDate,
    priority,
    setPriority,
    list,
    setList,
    dateMatch,
    listMatch,
    isFocused,
    setIsFocused,
    isSubmitting,
    formRef,
    hasGlow,
    handleDateChange,
    handleFormBlur,
    submit,
  } = useSmartTaskInput(onSubmit, lists ?? []);

  // Autocomplétion du tag #liste pendant la frappe.
  const autocomplete = useListAutocomplete(task, setTask, lists ?? []);

  // Sur saisie multi-ligne, les contrôles passent dans une barre en bas.
  const [multiline, setMultiline] = useState(false);

  const controls = (
    <>
      <DatePickerButton date={dueDate} onDateChange={handleDateChange} />
      <PrioritySelect value={priority} onChange={setPriority} />
      {lists !== undefined && (
        <ListControl
          variant="chip"
          list={list}
          lists={lists}
          onChange={setList}
        />
      )}
    </>
  );

  return (
    <motion.form
      ref={formRef}
      className={`w-full max-w-4xl rounded-[1.25rem] transition-[background-color,border-color,box-shadow] duration-500 ease-out ${
        isFocused
          ? "bg-background border border-border/50"
          : "bg-background/50 border border-transparent blur-0"
      } ${
        hasGlow
          ? "shadow-[0_0_20px_rgba(250,204,21,0.18)] dark:shadow-[0_0_20px_rgba(250,204,21,0.12)]"
          : "shadow-none"
      } p-2 flex gap-2 relative text-left ${
        multiline ? "flex-col" : "max-sm:flex-wrap items-center"
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      layout
      transition={{ type: "spring", bounce: 0.25, duration: 0.55 }}
      style={{ height: "auto", width: isFocused ? "100%" : "auto" }}
      onBlur={handleFormBlur}
    >
      <Popover
        open={autocomplete.open}
        onOpenChange={(o) => {
          if (!o) autocomplete.dismiss();
        }}
      >
        <PopoverAnchor asChild>
          <div className="relative min-w-0 flex-1">
            <AutoGrowTextarea
              value={task}
              onChange={setTask}
              onFocus={() => setIsFocused(true)}
              onEnter={submit}
              dateMatch={dateMatch}
              listMatch={listMatch}
              placeholder={placeholder}
              autoFocus={autoFocus}
              onMultilineChange={setMultiline}
              onKeyDown={autocomplete.onKeyDown}
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
          className="w-56 p-1"
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

      <AnimatePresence>
        {isFocused &&
          (multiline ? (
            // Barre d'outils sous le texte (style Todoist/Linear).
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
            // Contrôles alignés à droite, en ligne.
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

      <AnimatePresence>
        {!isFocused && task.trim() && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute right-2 top-2"
          >
            <Button
              variant="outline"
              type="submit"
              disabled={isSubmitting}
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
