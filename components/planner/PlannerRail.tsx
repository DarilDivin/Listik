"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  BookCheck,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  Inbox,
  Layers,
  Plus,
  Star,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ProgressRing } from "@/components/planner/ProgressRing";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pressable, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  PLANNER_VIEWS,
  type PlannerSelection,
  type PlannerView,
} from "@/features/todos/grouping";
import type { Area, Project } from "@/features/projects/types";

/** Icône par vue. `filled` : l'icône se remplit à l'état actif (façon Things). */
const VIEW_ICON: Record<PlannerView, { icon: LucideIcon; filled?: boolean }> = {
  inbox: { icon: Inbox },
  today: { icon: Star, filled: true },
  upcoming: { icon: CalendarDays },
  anytime: { icon: Layers },
  someday: { icon: Archive },
  journal: { icon: BookCheck },
};

/** Rangée du rail : même gabarit pour une vue, un domaine ou un projet. */
function RailRow({
  active,
  indent = false,
  onClick,
  icon,
  label,
  trailing,
  className,
}: {
  active: boolean;
  indent?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      {...pressable}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-xl py-2 text-left text-sm transition-colors max-md:justify-center max-md:px-0",
        indent ? "pl-7 pr-2.5 max-md:pl-0" : "px-2.5",
        active ? "text-brand" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {active && (
        <motion.span
          aria-hidden
          layoutId="rail-active"
          transition={spring.snappy}
          className="absolute inset-0 rounded-xl bg-brand-soft"
        />
      )}
      <span className="relative z-10 flex shrink-0 items-center">{icon}</span>
      <span className="relative z-10 flex-1 truncate font-medium max-md:hidden">
        {label}
      </span>
      {trailing && (
        <span className="relative z-10 max-md:hidden">{trailing}</span>
      )}
    </motion.button>
  );
}

interface PlannerRailProps {
  selection: PlannerSelection;
  onSelect: (selection: PlannerSelection) => void;
  counts: Record<PlannerView, number>;
  areas: Area[];
  projects: Project[];
  /** Progression d'un projet, pour son anneau. */
  progressOf: (projectId: string) => { done: number; total: number };
  onCreateArea: (name: string) => void;
  onCreateProject: (name: string, areaId: string | null) => void;
  onRenameArea: (id: string, name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteArea: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

/**
 * Navigation du Planificateur : les vues GTD (Boîte de réception, Aujourd'hui,
 * À venir, Quand je peux, Un jour, Journal) puis l'arbre Domaines → Projets —
 * les repères d'un habitué de Things.
 *
 * Vit DANS la page Planificateur, pas dans le shell : il fonctionne ainsi à
 * l'identique que l'utilisateur ait choisi le dock flottant ou la sidebar, et
 * la navigation d'app (4 sections) reste stable.
 *
 * Posé à plat sur le canvas, séparé par de simples hairlines — aucune carte.
 * L'état actif est une pastille `--brand-soft` partagée en `layoutId` qui
 * glisse d'une rangée à l'autre, comme le dock et la sidebar.
 */
export function PlannerRail({
  selection,
  onSelect,
  counts,
  areas,
  projects,
  progressOf,
  onCreateArea,
  onCreateProject,
  onRenameArea,
  onRenameProject,
  onDeleteArea,
  onDeleteProject,
}: PlannerRailProps) {
  // Domaines dépliés (tous ouverts par défaut : on ne cache pas le travail).
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Saisie inline d'un nouveau domaine/projet : `null` = fermée.
  const [draft, setDraft] = useState<{ areaId: string | null; kind: "area" | "project" } | null>(
    null,
  );
  const [draftName, setDraftName] = useState("");
  // Suppression en attente de confirmation (destructif → AlertDialog).
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "area" | "project"; id: string; name: string } | null
  >(null);

  const activeProjects = projects.filter((p) => p.status === "active");
  const orphanProjects = activeProjects.filter((p) => !p.area_id);

  const toggleArea = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commitDraft = () => {
    const name = draftName.trim();
    if (name && draft) {
      if (draft.kind === "area") onCreateArea(name);
      else onCreateProject(name, draft.areaId);
    }
    setDraft(null);
    setDraftName("");
  };

  const openDraft = (kind: "area" | "project", areaId: string | null) => {
    setDraft({ kind, areaId });
    setDraftName("");
  };

  const draftField = (forAreaId: string | null, kind: "area" | "project") =>
    draft &&
    draft.kind === kind &&
    draft.areaId === forAreaId && (
      <input
        autoFocus
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
          }
        }}
        placeholder={kind === "area" ? "Nouveau domaine…" : "Nouveau projet…"}
        className={cn(
          "w-full rounded-xl bg-foreground/[0.04] py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 max-md:hidden",
          kind === "project" ? "pl-7 pr-2.5" : "px-2.5",
        )}
      />
    );

  const projectRow = (project: Project, indent: boolean) => {
    const { done, total } = progressOf(project.id);
    const active = selection.kind === "project" && selection.id === project.id;
    return (
      <ContextMenu key={project.id}>
        <ContextMenuTrigger asChild>
          <div>
            <RailRow
              active={active}
              indent={indent}
              onClick={() => onSelect({ kind: "project", id: project.id })}
              label={project.name}
              icon={
                total > 0 ? (
                  <ProgressRing progress={done / total} size={15} strokeWidth={2.5} />
                ) : (
                  <FolderOpen size={15} />
                )
              }
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => {
              const name = window.prompt("Renommer le projet", project.name);
              if (name?.trim()) onRenameProject(project.id, name.trim());
            }}
          >
            Renommer…
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() =>
              setPendingDelete({ kind: "project", id: project.id, name: project.name })
            }
          >
            Supprimer
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <>
      <nav
        aria-label="Vues du planificateur"
        className="flex h-full w-52 shrink-0 flex-col overflow-y-auto border-r border-border/60 px-3 py-6 max-md:w-14"
      >
        {/* ── Vues GTD ── */}
        <div className="flex flex-col gap-0.5">
          {PLANNER_VIEWS.map((view, i) => {
            const { icon: Icon, filled } = VIEW_ICON[view.id];
            const active = selection.kind === "view" && selection.view === view.id;
            // Le Journal grossit indéfiniment : son compteur serait du bruit.
            const count = view.id === "journal" ? 0 : counts[view.id];

            return (
              <motion.div
                key={view.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: { ...spring.smooth, delay: i * 0.04 },
                }}
              >
                <RailRow
                  active={active}
                  onClick={() => onSelect({ kind: "view", view: view.id })}
                  label={view.label}
                  icon={
                    <Icon
                      size={16}
                      fill={active && filled ? "currentColor" : "none"}
                    />
                  }
                  trailing={
                    count > 0 ? (
                      <span
                        className={cn(
                          "font-mono text-[11px] tabular-nums",
                          active ? "text-brand/70" : "text-muted-foreground/50",
                        )}
                      >
                        <AnimatedNumber value={count} />
                      </span>
                    ) : undefined
                  }
                />
              </motion.div>
            );
          })}
        </div>

        {/* ── Arbre Domaines → Projets ── */}
        <div className="mt-4 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between px-2.5 pb-1 max-md:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
              Domaines
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Nouveau domaine"
                  onClick={() => openDraft("area", null)}
                  className="rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <Plus size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Nouveau domaine</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-col gap-0.5">
            {draftField(null, "area")}

            {areas.map((area) => {
              const areaProjects = activeProjects.filter(
                (p) => p.area_id === area.id,
              );
              const open = !collapsed.has(area.id);
              const active = selection.kind === "area" && selection.id === area.id;

              return (
                <div key={area.id}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center">
                        <button
                          type="button"
                          aria-label={open ? "Replier" : "Déplier"}
                          onClick={() => toggleArea(area.id)}
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/50 transition-colors hover:text-foreground max-md:hidden"
                        >
                          <motion.span
                            animate={{ rotate: open ? 90 : 0 }}
                            transition={spring.snappy}
                            className="flex"
                          >
                            <ChevronRight size={12} />
                          </motion.span>
                        </button>
                        <RailRow
                          active={active}
                          onClick={() => onSelect({ kind: "area", id: area.id })}
                          label={area.name}
                          icon={<Layers size={15} />}
                          className="min-w-0 flex-1"
                        />
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => openDraft("project", area.id)}>
                        Nouveau projet…
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => {
                          const name = window.prompt("Renommer le domaine", area.name);
                          if (name?.trim()) onRenameArea(area.id, name.trim());
                        }}
                      >
                        Renommer…
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() =>
                          setPendingDelete({ kind: "area", id: area.id, name: area.name })
                        }
                      >
                        Supprimer
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={spring.smooth}
                        className="overflow-hidden"
                      >
                        {areaProjects.map((p) => projectRow(p, true))}
                        {draftField(area.id, "project")}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Projets sans domaine, à la racine. */}
            {orphanProjects.map((p) => projectRow(p, false))}
            {draftField(null, "project")}

            <button
              type="button"
              onClick={() => openDraft("project", null)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground/60 transition-colors hover:text-foreground max-md:justify-center max-md:px-0"
            >
              <Plus size={15} className="shrink-0" />
              <span className="max-md:hidden">Nouveau projet</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Suppression : destructif → confirmation explicite. Rien n'est perdu,
          le contenu est seulement détaché — on le dit plutôt que d'effrayer. */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer « {pendingDelete?.name} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "area"
                ? "Ses projets et ses tâches ne sont pas supprimés : ils sortent simplement de ce domaine."
                : "Ses tâches ne sont pas supprimées : elles retournent simplement hors projet."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === "area") onDeleteArea(pendingDelete.id);
                else onDeleteProject(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
