"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";
import { spring } from "@/lib/motion";
import { usePlannerTodos } from "@/hooks/usePlannerTodos";
import { triggerPendingUndo } from "@/features/todos/useTodoMutations";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { TagFilterProvider } from "@/features/tags/tag-filter";
import { useNotesMutations } from "@/features/notes/useNotesMutations";
import Omnibar from "@/components/Omnibar";
import { EmptyState } from "@/components/todo/EmptyState";
import { ListFilter } from "@/components/todo/ListFilter";
import { AreaView } from "@/components/planner/AreaView";
import { HeroDay } from "@/components/planner/HeroDay";
import { PlannerRail } from "@/components/planner/PlannerRail";
import { ProjectView } from "@/components/planner/ProjectView";
import { SectionBody } from "@/components/planner/SectionBody";
import {
  SectionCard,
  type SectionTone,
} from "@/components/planner/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIPrefs, type SectionKey } from "@/components/ui-prefs";
import {
  countForView,
  groupTodosByDate,
  PLANNER_VIEWS,
  projectProgress,
  tasksOfArea,
  tasksOfProject,
  VIEW_SECTIONS,
  type DateGroupKey,
  type PlannerSelection,
  type PlannerView,
  type TodoGroups,
} from "@/features/todos/grouping";
import {
  applyOrdering,
  dropIntent,
  orderingContextOf,
  projectOrderingContext,
  reorderIds,
  type RailDropTarget,
} from "@/features/todos/ordering";
import { useOrderings } from "@/features/todos/useOrderings";
import {
  SelectionProvider,
  useSelectionController,
} from "@/features/todos/selection-context";
import { SelectionBar } from "@/components/todo/SelectionBar";
import type { TodoListDnd } from "@/components/todo/AnimatedTodoList";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { Priority, Todo, TodoStatus } from "@/features/todos/types";

/** Présentation de chaque groupe : libellé, tonalité, date implicite. */
const SECTION_META: Record<
  DateGroupKey,
  { label: string; tone: SectionTone; overdue?: boolean; dateImplied?: boolean }
> = {
  overdue: { label: "En retard", tone: "danger", overdue: true },
  today: { label: "Aujourd'hui", tone: "today", dateImplied: true },
  evening: { label: "Ce soir", tone: "today", dateImplied: true },
  tomorrow: { label: "Demain", tone: "default", dateImplied: true },
  upcoming: { label: "À venir", tone: "default" },
  inbox: { label: "Boîte de réception", tone: "default" },
  anytime: { label: "Quand je peux", tone: "default" },
  someday: { label: "Un jour", tone: "default" },
  completed: { label: "Terminées", tone: "default" },
};

/** État vide, propre à chaque vue — invite à agir plutôt qu'à constater. */
const EMPTY_COPY: Record<PlannerView, { title: string; subtitle: string }> = {
  inbox: {
    title: "Boîte de réception vide",
    subtitle: "Tout est trié. Capturez une idée ci-dessous.",
  },
  today: {
    title: "Rien pour aujourd'hui",
    subtitle: "Profitez-en, ou planifiez une tâche ci-dessous.",
  },
  upcoming: {
    title: "Rien à venir",
    subtitle: "Aucune tâche planifiée pour les prochains jours.",
  },
  anytime: {
    title: "Rien à faire pour l'instant",
    subtitle: "Les tâches d'un projet, sans date, apparaissent ici.",
  },
  someday: {
    title: "Aucune idée en réserve",
    subtitle: "Rangez ici ce que vous ferez un jour, sans vous engager.",
  },
  journal: {
    title: "Journal vide",
    subtitle: "Vos tâches terminées s'archiveront ici.",
  },
};

interface PlannerSection {
  key: SectionKey;
  label: string;
  items: Todo[];
  tone: SectionTone;
  overdue?: boolean;
  /** La date de ces tâches est implicite (section = un jour précis) : on ne la répète pas. */
  dateImplied?: boolean;
}

/**
 * Une tâche (dé)cochée reste dans sa section le temps que la coche se trace
 * et que l'œil enregistre le changement, puis glisse vers sa vraie section.
 * Sans cette pause, la ligne disparaît avant même la fin de l'animation de
 * la case — le geste le plus répété de l'app perdrait toute sa récompense.
 */
const LINGER_MS = 900;

/**
 * Repli/dépli du chrome (hero + filtres) quand une section passe en portail :
 * la hauteur s'anime (jamais de démontage sec → aucun saut de layout), le
 * contenu s'efface un peu plus vite qu'il ne se replie.
 */
const chromeVariants = {
  open: {
    height: "auto",
    opacity: 1,
    transition: { height: spring.smooth, opacity: { duration: 0.3, delay: 0.06 } },
  },
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { height: spring.smooth, opacity: { duration: 0.18 } },
  },
} as const;

export default function PlannerPage() {
  const {
    todos,
    loading,
    error,
    createTodoFromSmart,
    toggleTodo,
    deleteTodo,
    updateTodo,
    toggleManyTodos,
    updateManyTodos,
  } = usePlannerTodos();
  const { createNote } = useNotesMutations();
  const {
    areas,
    projects,
    loading: projectsLoading,
    createArea,
    createProject,
    updateArea,
    updateProject,
    deleteArea,
    deleteProject,
    completeProject,
  } = useProjects();
  const { tags } = useTags();
  const { positionsByContext, setOrdering } = useOrderings();
  const { sectionStyles } = useUIPrefs();

  // Noms des projets actifs — autocomplétion `#` de l'omnibar.
  const projectNames = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "fr")),
    [projects],
  );

  // Tags proposés au filtre (chips). Le rattachement, lui, se navigue au rail.
  const tagFilterItems = useMemo(
    () => tags.map((t) => ({ id: t.id, label: t.name })),
    [tags],
  );

  // Progression d'un projet (anneaux du rail et de la vue domaine).
  const progressOf = useMemo(
    () => (projectId: string) => projectProgress(todos, projectId),
    [todos],
  );

  // Aujourd'hui est l'accueil, comme dans Things.
  const [selection, setSelection] = useState<PlannerSelection>({
    kind: "view",
    view: "today",
  });
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [portalKey, setPortalKey] = useState<SectionKey | null>(null);
  // Le clip (overflow-hidden) ne vit que pendant le repli/dépli du chrome :
  // au repos déplié, il est retiré pour que la barre de filtres reste sticky.
  const [chromeClipped, setChromeClipped] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Tâches fraîchement (dé)cochées : id → statut de routage (celui d'AVANT le
  // basculement), le temps de la pause. Voir LINGER_MS.
  const [linger, setLinger] = useState<ReadonlyMap<string, TodoStatus>>(
    new Map(),
  );
  const lingerTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = lingerTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const todayISO = todayLocalISODate();
  const tomorrowISO = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toLocalISODate(t);
  }, []);

  // Filtre par tag, routage avec pause, puis regroupement GTD.
  const groups: TodoGroups = useMemo(() => {
    const visible = tagFilter
      ? todos.filter((t) => t.tags.some((tag) => tag.id === tagFilter))
      : todos;
    const routed = linger.size
      ? visible.map((t) => {
          const routeAs = linger.get(t.id);
          return routeAs && routeAs !== t.status ? { ...t, status: routeAs } : t;
        })
      : visible;
    const result = groupTodosByDate(routed, todayISO, tomorrowISO);
    if (linger.size) {
      // Le routage seul était patché : on ré-affiche les objets réels pour
      // que la ligne montre son vrai statut (coche, barré) pendant la pause.
      const byId = new Map(visible.map((todo) => [todo.id, todo]));
      for (const key of Object.keys(result) as (keyof TodoGroups)[]) {
        result[key] = result[key].map((todo) => byId.get(todo.id) ?? todo);
      }
    }
    return result;
  }, [todos, tagFilter, todayISO, tomorrowISO, linger]);

  // Compteurs du rail : calculés sur les mêmes données que le contenu — ce qui
  // est compté est exactement ce qui est affiché (filtre de liste compris).
  const counts = useMemo(
    () =>
      Object.fromEntries(
        PLANNER_VIEWS.map((v) => [v.id, countForView(groups, v.id)]),
      ) as Record<PlannerView, number>,
    [groups],
  );

  // Pouls du jour (global, indépendant du filtre liste) — lui réagit tout de
  // suite : l'anneau et le compteur récompensent la coche pendant la pause.
  const { doneToday, totalToday } = useMemo(() => {
    const day = todos.filter((t) => t.scheduled_for === todayISO);
    return {
      doneToday: day.filter((t) => t.status === "completed").length,
      totalToday: day.length,
    };
  }, [todos, todayISO]);

  // Projet/domaine sélectionné. `undefined` = supprimé entre-temps (autre
  // fenêtre, menu contextuel) → on retombe sur Aujourd'hui plutôt que
  // d'afficher une vue fantôme.
  const activeProject =
    selection.kind === "project"
      ? projects.find((p) => p.id === selection.id)
      : undefined;
  const activeArea =
    selection.kind === "area"
      ? areas.find((a) => a.id === selection.id)
      : undefined;

  useEffect(() => {
    // `projectsLoading` : ne pas confondre « pas encore chargé » avec
    // « supprimé » — sinon un simple rafraîchissement éjecterait la sélection.
    if (projectsLoading) return;
    if (
      (selection.kind === "project" && !activeProject) ||
      (selection.kind === "area" && !activeArea)
    ) {
      setSelection({ kind: "view", view: "today" });
    }
  }, [selection, activeProject, activeArea, projectsLoading]);

  const currentView: PlannerView | null =
    selection.kind === "view" ? selection.view : null;

  // Sections de la vue GTD courante, dans l'ordre — avec l'ordre MANUEL du
  // contexte appliqué là où il existe (today/inbox/anytime/someday).
  const viewSections: PlannerSection[] = currentView
    ? VIEW_SECTIONS[currentView].map((key) => {
        const ctx = orderingContextOf(key);
        const items = ctx
          ? applyOrdering(groups[key], positionsByContext.get(ctx))
          : groups[key];
        return { key, items, ...SECTION_META[key] };
      })
    : [];

  // Ordre affiché à plat de la branche courante — l'ancre de la sélection par
  // plage (Maj+clic) doit correspondre à ce que l'œil voit. Non mémoïsé :
  // `useSelectionController` ne fait qu'assigner ce tableau à une ref à chaque
  // rendu (voir plus bas), aucun autre calcul n'en dépend.
  const visibleOrderedIds: string[] = activeProject
    ? applyOrdering(
        tasksOfProject(todos, activeProject.id),
        positionsByContext.get(projectOrderingContext(activeProject.id)),
      )
        .filter((t) => t.status === "pending")
        .map((t) => t.id)
    : activeArea
      ? tasksOfArea(todos, activeArea.id)
          .filter((t) => t.status === "pending")
          .map((t) => t.id)
      : viewSections.flatMap((s) => s.items.map((t) => t.id));

  const multiSelect = useSelectionController(visibleOrderedIds);
  const selectedCount = multiSelect.selectedIds.size;

  // Actions par lot (K2) : `updateManyTodos`/`toggleManyTodos` arment UN SEUL
  // toast d'annulation restaurant chaque tâche à sa propre valeur d'avant —
  // pas N annulations indépendantes qui se remplaceraient l'une l'autre. La
  // suppression, elle, garde sa propre mécanique (délai + annulation par
  // tâche) : c'est un système distinct, volontairement non unifié.
  const withSelection = (run: (ids: string[]) => void) => {
    const ids = [...multiSelect.selectedIds];
    multiSelect.clear();
    run(ids);
  };
  const batch = {
    today: () =>
      withSelection((ids) =>
        void updateManyTodos(ids, {
          scheduled_for: todayISO,
          someday: false,
          this_evening: false,
        }),
      ),
    tomorrow: () =>
      withSelection((ids) =>
        void updateManyTodos(ids, { scheduled_for: tomorrowISO, someday: false }),
      ),
    someday: () =>
      withSelection((ids) => void updateManyTodos(ids, { someday: true })),
    // Ne coche que les tâches en cours (cocher une terminée la rouvrirait) —
    // filtré dans `toggleManyTodos` lui-même.
    complete: () => withSelection((ids) => void toggleManyTodos(ids)),
    assignProject: (projectId: string) =>
      withSelection(
        (ids) => void updateManyTodos(ids, { project_id: projectId, area_id: null }),
      ),
    remove: () =>
      withSelection((ids) => ids.forEach((id) => void deleteTodo(id))),
  };

  // Échap vide la sélection (avant le portail : deux gestes distincts).
  useEffect(() => {
    if (selectedCount === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        multiSelect.clear();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selectedCount, multiSelect]);

  // Ctrl/Cmd+Z : rejoue l'undo en attente (à un pas, pas un historique — un
  // seul niveau, comme le reste de K2). Garde OBLIGATOIRE : ne rien faire si
  // le focus est dans un champ de saisie, sinon on avalerait l'undo texte
  // natif de l'Omnibar ou de l'éditeur de notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      triggerPendingUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Une ligne en pause LINGER n'est pas déplaçable : le minuteur la ferait
  // disparaître en plein geste, et le drop entrerait en course avec le toggle.
  const canDragTodo = (id: string) => !linger.has(id);

  /** Câblage DnD d'une section : réordonnable si elle a un contexte, sinon
   *  simple source (glisser vers le rail). */
  const dndForSection = (key: SectionKey, items: Todo[]): TodoListDnd => {
    const ctx = orderingContextOf(key);
    return {
      context: ctx,
      onReorder: (draggedId, targetId, edge) => {
        if (!ctx) return;
        // Le premier drag fige l'ordre AFFICHÉ de toute la section : plus
        // d'état mixte positionné/non-positionné après ce point.
        void setOrdering(
          ctx,
          reorderIds(items.map((t) => t.id), draggedId, targetId, edge),
        );
      },
      canDrag: canDragTodo,
    };
  };

  // Dépôt d'une tâche sur le rail : la mutation vient du mapping pur
  // `dropIntent` (no-op → on ne fait rien, pas d'écriture pour rien).
  const handleRailDrop = (target: RailDropTarget, todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    const intent = dropIntent(target, todo, todayISO, tomorrowISO);
    if (intent) void updateTodo(todoId, intent);
  };

  const portalSection = portalKey
    ? viewSections.find((s) => s.key === portalKey) ?? null
    : null;

  // Une seule liste de sections : en mode portail elle se réduit à la section
  // ouverte, qui GARDE sa clé React — le même nœud morphe vers le haut pendant
  // que ses voisines s'effacent (aucun démontage/remontage, aucun trou).
  const stackSections = viewSections.filter((s) => s.items.length > 0);
  const renderedSections = portalSection ? [portalSection] : stackSections;
  const isEmpty = stackSections.length === 0;

  const openPortal = (key: SectionKey) => {
    setChromeClipped(true);
    setPortalKey(key);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closePortal = () => setPortalKey(null);

  // Changer de sélection ferme le portail et remonte en haut.
  const changeSelection = (next: PlannerSelection) => {
    setPortalKey(null);
    setSelection(next);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Échap referme la vue portail.
  useEffect(() => {
    if (!portalKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPortalKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [portalKey]);

  const handleToggle = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      const reschedules = todo.recurrence !== "none" && todo.status === "pending";
      const existingTimer = lingerTimers.current.get(id);
      if (existingTimer) {
        // Re-basculée pendant la pause : elle reprend sa place naturelle.
        clearTimeout(existingTimer);
        lingerTimers.current.delete(id);
        setLinger((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } else if (!reschedules) {
        setLinger((prev) => new Map(prev).set(id, todo.status));
        lingerTimers.current.set(
          id,
          setTimeout(() => {
            lingerTimers.current.delete(id);
            setLinger((prev) => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }, LINGER_MS),
        );
      }
    }
    void toggleTodo(id);
  };

  /**
   * Défauts de capture selon la sélection : ce qu'on saisit doit apparaître là
   * où on l'a saisi. Appliqués seulement si aucune date n'a été reconnue dans
   * le texte (la saisie explicite prime toujours).
   * Boîte de réception / Quand je peux / Journal : aucun défaut → la tâche
   * tombe en boîte de réception, à trier plus tard (méthode GTD).
   */
  const captureOptions = () => {
    // Dans un projet/domaine, la capture s'y range d'office — même datée.
    if (selection.kind === "project")
      return { container: { project_id: selection.id } };
    if (selection.kind === "area") return { container: { area_id: selection.id } };
    if (selection.view === "today")
      return { whenUndated: { scheduled_for: todayISO } };
    if (selection.view === "upcoming")
      return { whenUndated: { scheduled_for: tomorrowISO } };
    if (selection.view === "someday") return { whenUndated: { someday: true } };
    return {};
  };

  const handleCreateTodo = async (taskData: {
    text: string;
    note?: string;
    dueDate?: Date | null;
    priority?: Priority;
    list?: string | null;
  }) => {
    await createTodoFromSmart(taskData, captureOptions());
  };

  const handleCreateNote = async (text: string) => {
    await createNote({ content: text });
    toast.success("Note créée");
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-52 shrink-0 border-r border-border/60 max-md:w-14" />
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-[46rem] px-8 pt-10">
            <div className="flex items-end justify-between gap-6 border-b border-border/60 pb-6">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-3 h-10 w-56" />
                <Skeleton className="mt-3 h-3.5 w-28" />
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <Skeleton className="size-[92px] rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-6 w-14" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 pt-6">
              {["w-3/4", "w-1/2", "w-2/3"].map((w, i) => (
                <div
                  key={w}
                  className="flex items-center gap-3"
                  style={{ opacity: 1 - i * 0.25 }}
                >
                  <Skeleton className="size-[18px] shrink-0 rounded-full" />
                  <Skeleton className={`h-4 ${w}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date();
  // Le hero (date + progression du jour) n'a de sens que sur la vue Aujourd'hui.
  const showHero = currentView === "today";

  return (
    <TagFilterProvider onFilterTag={setTagFilter}>
    <SelectionProvider value={multiSelect}>
    <div className="relative flex h-full">
      <PlannerRail
        selection={selection}
        onSelect={changeSelection}
        counts={counts}
        areas={areas}
        projects={projects}
        progressOf={progressOf}
        onCreateArea={(name) => void createArea({ name })}
        onCreateProject={(name, areaId) =>
          void createProject({ name, area_id: areaId })
        }
        onRenameArea={(id, name) => void updateArea(id, { name })}
        onRenameProject={(id, name) => void updateProject(id, { name })}
        onDeleteArea={(id) => void deleteArea(id)}
        onDeleteProject={(id) => void deleteProject(id)}
        onDropTodo={handleRailDrop}
      />

      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Voile d'accent très doux en haut du canvas */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-72"
          style={{
            background:
              "radial-gradient(50% 70% at 50% -12%, var(--brand-soft), transparent 70%)",
          }}
        />

        {/* ───────── Zone défilante ───────── */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[46rem] px-8">
            {error && (
              <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
                <span className="h-1 w-1 rounded-full bg-destructive" />
                {error}
              </div>
            )}

            {/* Un projet/domaine n'est pas un horizon temporel : sa vue est
                bâtie sur un filtre direct de rattachement, pas sur les groupes
                GTD (une tâche datée vit dans Aujourd'hui ET dans son projet). */}
            {activeProject ? (
              <ProjectView
                project={activeProject}
                todos={applyOrdering(
                  tasksOfProject(todos, activeProject.id),
                  positionsByContext.get(projectOrderingContext(activeProject.id)),
                )}
                dnd={{
                  context: projectOrderingContext(activeProject.id),
                  onReorder: (draggedId, targetId, edge) => {
                    const ctx = projectOrderingContext(activeProject.id);
                    const pendingIds = applyOrdering(
                      tasksOfProject(todos, activeProject.id),
                      positionsByContext.get(ctx),
                    )
                      .filter((t) => t.status === "pending")
                      .map((t) => t.id);
                    void setOrdering(
                      ctx,
                      reorderIds(pendingIds, draggedId, targetId, edge),
                    );
                  },
                  canDrag: canDragTodo,
                }}
                onToggle={handleToggle}
                onDelete={deleteTodo}
                onUpdate={updateTodo}
                onRename={(name) => void updateProject(activeProject.id, { name })}
                onChangeNote={(note) =>
                  void updateProject(activeProject.id, { note })
                }
                onComplete={(completeTasks) =>
                  void completeProject(activeProject.id, completeTasks)
                }
                onReopen={() =>
                  void updateProject(activeProject.id, { status: "active" })
                }
              />
            ) : activeArea ? (
              <AreaView
                area={activeArea}
                projects={projects.filter(
                  (p) => p.area_id === activeArea.id && p.status === "active",
                )}
                todos={tasksOfArea(todos, activeArea.id)}
                progressOf={progressOf}
                onOpenProject={(id) => changeSelection({ kind: "project", id })}
                onToggle={handleToggle}
                onDelete={deleteTodo}
                onUpdate={updateTodo}
                onRename={(name) => void updateArea(activeArea.id, { name })}
              />
            ) : (
              currentView && (
                <LayoutGroup>
                  <motion.div
                    initial={false}
                    animate={portalSection || !showHero ? "collapsed" : "open"}
                    variants={chromeVariants}
                    onAnimationComplete={(definition) => {
                      if (definition === "open") setChromeClipped(false);
                    }}
                    className={chromeClipped ? "overflow-hidden" : undefined}
                  >
                    <div className="pt-8">
                      <HeroDay date={today} done={doneToday} total={totalToday} />
                    </div>
                  </motion.div>

                  {/* Filtre de projet collant : élément sticky À PART, enfant direct
                      de la colonne (un sticky ne colle que dans les limites de son
                      parent — il lui faut donc un parent qui contient aussi les
                      sections). Il porte lui-même son repli en portail. */}
                  {tagFilterItems.length > 0 && (
                    <motion.div
                      initial={false}
                      animate={portalSection ? "collapsed" : "open"}
                      variants={chromeVariants}
                      className="sticky top-0 z-10 -mx-8 overflow-hidden bg-background/85 backdrop-blur-md"
                    >
                      <div className="px-8 pt-5 pb-3">
                        <ListFilter
                          items={tagFilterItems}
                          value={tagFilter}
                          onChange={setTagFilter}
                        />
                      </div>
                    </motion.div>
                  )}

                  <motion.div
                    initial={false}
                    animate={{ paddingTop: portalSection ? 32 : showHero ? 4 : 24 }}
                    transition={spring.smooth}
                    className="pb-10"
                  >
                    <AnimatePresence mode="popLayout">
                      {renderedSections.map((section, i) => (
                        <SectionCard
                          key={section.key}
                          title={section.label}
                          count={section.items.length}
                          tone={section.tone}
                          delay={i * 0.05}
                          sectionKey={section.key}
                          portalActive={section.key === portalKey}
                          onEnterPortal={() => openPortal(section.key)}
                          onExitPortal={closePortal}
                        >
                          {section.items.length > 0 ? (
                            <SectionBody
                              style={sectionStyles[section.key]}
                              todos={section.items}
                              onToggle={handleToggle}
                              onDelete={deleteTodo}
                              onUpdate={updateTodo}
                              overdue={section.overdue}
                              showDate={!section.dateImplied}
                              dnd={dndForSection(section.key, section.items)}
                            />
                          ) : (
                            // La dernière tâche vient d'être cochée en portail.
                            <EmptyState
                              title="Section vide"
                              subtitle="Plus rien ici pour le moment."
                            />
                          )}
                        </SectionCard>
                      ))}

                      {!portalSection && isEmpty && (
                        <EmptyState
                          key={`empty-${currentView}`}
                          title={EMPTY_COPY[currentView].title}
                          subtitle={EMPTY_COPY[currentView].subtitle}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                </LayoutGroup>
              )
            )}
          </div>
        </div>

        {/* Barre d'actions par lot : flotte au-dessus de la capture. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <SelectionBar
            count={selectedCount}
            projects={projects}
            areas={areas}
            onScheduleToday={batch.today}
            onScheduleTomorrow={batch.tomorrow}
            onSomeday={batch.someday}
            onComplete={batch.complete}
            onAssignProject={batch.assignProject}
            onDelete={batch.remove}
            onClear={multiSelect.clear}
          />
        </div>

        {/* ───────── Capture épinglée en bas ───────── */}
        <div className="relative z-10 shrink-0 bg-background/90 backdrop-blur-sm">
          {/* Fondu doux au-dessus de la capture (au lieu d'un trait) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent"
          />
          <div className="mx-auto max-w-[46rem] px-8 py-4">
            <Omnibar
              defaultMode="task"
              onSubmit={handleCreateTodo}
              onSubmitNote={handleCreateNote}
              placeholder="Capturer une tâche…"
              lists={projectNames}
            />
          </div>
        </div>
      </div>
    </div>
    </SelectionProvider>
    </TagFilterProvider>
  );
}
