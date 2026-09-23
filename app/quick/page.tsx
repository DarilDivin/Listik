"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  cursorPosition,
  getCurrentWindow,
  monitorFromPoint,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import BarreTache from "@/components/BarreTache";
import BarreJournal from "@/components/BarreJournal";
import BarreAssistant from "@/components/BarreAssistant";
import { QuickBubble } from "@/components/QuickBubble";
import { QuickAnswer } from "@/components/QuickAnswer";
import { QuickPills, QUICK_ITEMS, type QuickMode } from "@/components/QuickPills";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { SmartTaskData } from "@/features/todos/useTaskMode";
import { aiAgent } from "@/features/omnibar/agent";
import { buildHistory, QUICK_OPEN_ASSISTANT_EVENT, type Turn } from "@/features/assistant/conversation";
import { QUICK_OPEN_JOURNAL_EVENT } from "@/features/journal/quick";
import { cn } from "@/lib/utils";

type AskPhase = "idle" | "reflexion" | "reponse";

const BAR_WIDTH = 420;
const ACTIVE_BAR_WIDTH = 520;
const TASK_MIN_HEIGHT = 52;
// Cadre natif constant pour les petites scènes. Il absorbe les ombres et les
// trajectoires de morphing sans devenir une zone invisible encombrante.
const BAR_TRANSITION_CANVAS = { width: 640, height: 164 };
const TASK_OVERLAY_FALLBACK_HEIGHT = 460;
const TASK_OVERLAY_MARGIN = 12;
const RESPONSE_DEFAULT_SIZE = { width: 440, height: 272 };
const RESPONSE_MIN_SIZE = { width: 400, height: 260 };
const RESPONSE_MAX_SIZE = { width: 840, height: 640 };
const JOURNAL_DEFAULT_SIZE = { width: 680, height: 600 };
const JOURNAL_MIN_SIZE = { width: 480, height: 360 };
const JOURNAL_MAX_SIZE = { width: 1000, height: 900 };
// Mouvement posé, sans rebond : la surface est un objet dense, pas une
// notification. Cette courbe est partagée par toute la scène rapide.
const MORPH_EASE = [0.22, 0.9, 0.28, 1] as const;
const MORPH_DURATION = 0.58;
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Barre de capture rapide (style Spotlight) : la fenêtre `quick` est une barre
 * flottante transparente. On l'ouvre via le raccourci global (Alt+Q) ou le
 * tray. Elle se ferme après validation (mode Tâche), sur Échap, ou quand elle
 * perd le focus (clic ailleurs / changement d'application) — SAUF pendant
 * qu'une question est en cours de réflexion ou de réponse, voir plus bas.
 *
 * Les petites scènes partagent une enveloppe native discrète, assez grande
 * pour leurs ombres et leurs mouvements. Les grands panneaux gardent leurs
 * propres dimensions. Ainsi un clic à côté atteint l'application sous-jacente
 * sans que le bord du webview ne coupe une transition.
 *
 * États : la barre Assistant neutre, les deux outils de capture, et — pour
 * une question — deux sous-états supplémentaires : `reflexion`
 * (`QuickBubble`, un cercle qui réutilise le filtre gooey des pastilles) puis
 * `reponse` (`QuickAnswer`, plus étroite que la barre). Une relance depuis
 * `reponse` NE repasse PAS par la bulle — seule la toute première question
 * fait tout le chemin.
 *
 * Pas de bouton d'annuler pendant `reflexion` (décision utilisateur,
 * 2026-09-16) : la latence réelle tourne autour de 12s, contre 1,5s dans
 * l'artifact — volontairement laissé sans échappatoire pour l'instant,
 * « comme un processus de réflexion ». Échap reste le filet global, lui,
 * inchangé (ferme toute la fenêtre, pas juste la question).
 *
 * Ouvrir dans l'Assistant transmet la DERNIÈRE question/réponse par un
 * événement front-à-front (`QUICK_OPEN_ASSISTANT_EVENT`, écouté par
 * `app/(app)/assistant/page.tsx`) — pas toute la conversation : rien ne la
 * persiste aujourd'hui (décision déjà actée dans le roadmap).
 */
function isOverlayOpen() {
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}

export default function QuickPage() {
  useTodosSync();
  const { createTodo } = useTodoMutations();
  const { projects, createProject } = useProjects();
  const { resolveTagNames, setTodoTags } = useTags();
  const lists = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "fr")),
    [projects],
  );

  const [mode, setMode] = useState<QuickMode>("neutre");
  const [neutralText, setNeutralText] = useState("");
  const [mountKey, setMountKey] = useState(0);
  const [revealEpoch, setRevealEpoch] = useState(0);
  const [askPhase, setAskPhase] = useState<AskPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [answerSize, setAnswerSize] = useState(RESPONSE_DEFAULT_SIZE);
  const [journalSize, setJournalSize] = useState(JOURNAL_DEFAULT_SIZE);
  const [taskOverlayHeight, setTaskOverlayHeight] = useState<number | null>(null);
  const [taskOverlayOpen, setTaskOverlayOpen] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const pendingRef = useRef(false); // garde de réentrance, voir assistant/page.tsx
  const wasHidden = useRef(true);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const journalSizeRef = useRef(JOURNAL_DEFAULT_SIZE);
  const taskOverlayPrimed = useRef(false);
  const nativeSizeRef = useRef(BAR_TRANSITION_CANVAS);
  const pendingNativeSizeRef = useRef<{ width: number; height: number } | null>(null);
  const queuedNativeSizeRef = useRef<{ width: number; height: number } | null>(null);
  const nativeResizeRunningRef = useRef(false);

  const updateJournalSize = useCallback((next: { width: number; height: number }) => {
    journalSizeRef.current = next;
    nativeSizeRef.current = next;
    setJournalSize(next);
  }, []);

  const resetAsk = useCallback(() => {
    setAskPhase("idle");
    setTurns([]);
    setAnswerSize(RESPONSE_DEFAULT_SIZE);
    pendingRef.current = false;
    setPending(false);
  }, []);

  // La fenêtre est conservée cachée entre deux raccourcis. On la remet dans
  // son état neutre AVANT de la cacher, sinon Motion conserve une réponse ou
  // une bulle dans le DOM et la fait sortir au prochain affichage.
  const resetQuickSurface = useCallback(() => {
    setMode("neutre");
    setNeutralText("");
    resetAsk();
  }, [resetAsk]);

  const hide = useCallback(() => {
    wasHidden.current = true;
    flushSync(resetQuickSurface);
    invoke("hide_quick_window").catch(() => {});
  }, [resetQuickSurface]);

  useEffect(() => {
    const unlisten = listen("quick:will-hide", () => {
      // The global shortcut hides the native window directly. Reset before the
      // next reveal so the new surface never morphs from stale content.
      if (wasHidden.current) return;

      wasHidden.current = true;
      flushSync(() => {
        resetQuickSurface();
        setMountKey((key) => key + 1);
      });
    });

    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [resetQuickSurface]);

  const switchMode = useCallback((next: Exclude<QuickMode, "neutre">) => {
    setMode(next);
    setNeutralText("");
    resetAsk();
  }, [resetAsk]);

  const returnToNeutral = useCallback(() => {
    // La cible compacte doit être connue avant le rendu du fondu, même si la
    // scène précédente est un Journal de plusieurs centaines de pixels.
    setHeight(TASK_MIN_HEIGHT);
    resetQuickSurface();
  }, [resetQuickSurface]);

  // Le mot qui se solidifie : premier mot du champ NEUTRE, suivi d'une
  // espace. Vérifié sur la valeur ENTRANTE (avant `setNeutralText`) pour ne
  // pas dépendre d'un rendu supplémentaire.
  const handleNeutralChange = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();
      const trigger = QUICK_ITEMS.find((item) => lower.startsWith(`${item.mot} `));
      if (trigger) {
        switchMode(trigger.mode);
        return;
      }
      setNeutralText(text);
    },
    [switchMode],
  );

  // Focus + reset à l'affichage ; fermeture au blur — SUSPENDUE tant qu'une
  // question est en vol ou affichée (decision 04 du roadmap) : une réponse
  // qu'on veut lire ou dans laquelle on veut cliquer ne peut pas disparaître
  // au clic suivant.
  useEffect(() => {
    const win = getCurrentWindow();
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const keepsWindowOpen = mode === "journal" || (mode === "question" && askPhase !== "idle");

    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (blurTimer) clearTimeout(blurTimer);
        if (wasHidden.current) {
          wasHidden.current = false;
          resetQuickSurface();
          setMountKey((k) => k + 1);
          // La fenêtre est conservée cachée entre deux ouvertures. Rejouer
          // l'ajustement de scène lui rend son enveloppe de transition, même
          // si le mode React est déjà « neutre ».
          setRevealEpoch((epoch) => epoch + 1);
        }
        return;
      }

      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus() && !isOverlayOpen() && !keepsWindowOpen) hide();
      }, 120);
    });

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      unlisten.then((stop) => stop());
    };
  }, [hide, mode, askPhase, resetQuickSurface]);

  // Échap → fermer TOUTE la fenêtre, même pendant une question : le filet
  // global reste le filet global, à la différence du blur ci-dessus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide]);

  const handleSubmit = useCallback(
    async (data: SmartTaskData) => {
      const due = data.dueDate ? toLocalISODate(data.dueDate) : null;

      let projectId: string | null = null;
      if (data.list) {
        const name = data.list.trim();
        const existing = projects.find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        projectId = existing ? existing.id : (await createProject({ name })).id;
      }

      const todo = await createTodo({
        text: data.text,
        note: data.note ?? null,
        priority: data.priority ?? "normal",
        scheduled_for: due ?? todayLocalISODate(),
        due_date: null,
        project_id: projectId,
      });

      if (data.tags?.length) {
        const ids = await resolveTagNames(data.tags);
        if (ids.length) await setTodoTags(todo.id, ids);
      }

      hide();
    },
    [createTodo, createProject, projects, resolveTagNames, setTodoTags, hide],
  );

  // Pose/complète un tour — partagé par la toute première question (qui
  // vient de la bulle) et les relances (qui restent dans le panneau réponse).
  const askQuestion = useCallback(
    async (text: string) => {
      const id = crypto.randomUUID();
      const history = buildHistory(turns);
      setTurns((prev) => [...prev, { id, question: text }]);
      setPending(true);
      try {
        const res = await aiAgent(text, history);
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, answer: res.message } : t)));
      } catch (e) {
        // Une indisponibilité du CLI est un état utilisateur géré par le fil,
        // pas une exception d'interface : `console.error` ferait surgir le
        // panneau rouge de Next pendant les essais de la fenêtre rapide.
        console.warn("ai_agent_run:", e);
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, error: true, answer: e instanceof Error ? e.message : "L’assistant est indisponible." }
              : t,
          ),
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [turns],
  );

  // Première question : bulle de réflexion jusqu'à la réponse, PUIS bascule
  // en panneau réponse — jamais l'inverse (le panneau n'a pas de état
  // "réflexion" à lui, la bulle le porte déjà).
  const handleAskSubmit = useCallback(
    (text: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setAskPhase("reflexion");
      void askQuestion(text).then(() => {
        if (!wasHidden.current) setAskPhase("reponse");
      });
    },
    [askQuestion],
  );

  // Relance : reste dans `reponse`, le tour en attente s'affiche dans le fil.
  const handleFollowUp = useCallback(
    (text: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      void askQuestion(text);
    },
    [askQuestion],
  );

  const handleOpenInAssistant = useCallback(() => {
    const last = turns[turns.length - 1];
    if (last?.answer !== undefined) {
      emit(QUICK_OPEN_ASSISTANT_EVENT, { question: last.question, answer: last.answer }).catch(() => {});
    }
    hide();
    invoke("show_main_window").catch(() => {});
  }, [turns, hide]);

  const handleOpenInJournal = useCallback(() => {
    emit(QUICK_OPEN_JOURNAL_EVENT).catch(() => {});
    hide();
    invoke("show_main_window").catch(() => {});
  }, [hide]);

  // Neutre sans mot-clé, validé : « va vers l'assistant » veut dire prendre
  // tout le chemin Question — bascule en mode Question (pastilles repliées),
  // puis soumission immédiate. Pas de raccourci qui ouvrirait juste la
  // fenêtre principale : ce serait plus pauvre que la bulle + réponse que la
  // fenêtre rapide sait déjà montrer.
  const handleNeutralSubmit = useCallback(() => {
    const text = neutralText.trim();
    if (!text) return;
    switchMode("question");
    handleAskSubmit(text);
  }, [neutralText, switchMode, handleAskSubmit]);

  // Seule la scène qui ENTRE pilote la hauteur compacte. Mesurer le conteneur
  // partagé pendant un fondu superposé ferait conserver la hauteur du Journal
  // qui sort, puis provoquerait le saut que l'on cherche à éviter.
  const measureObserverRef = useRef<ResizeObserver | null>(null);

  const measureScene = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    measureObserverRef.current?.disconnect();
    const update = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      // Une coque qui se contracte modifie la largeur de son enfant à chaque
      // frame. Si sa hauteur reste la même, redemander un rendu React ne fait
      // qu'ajouter une saccade à une animation qui devrait rester composée.
      setHeight((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(update);
    measureObserverRef.current = observer;
    observer.observe(element);
    update();
  }, []);

  useEffect(() => () => measureObserverRef.current?.disconnect(), []);

  /** Icône de tête cliquable, posée dans la barre/le panneau actif — le seul chemin de retour au neutre. */
  const returnBadge = (
    targetMode: Exclude<QuickMode, "neutre">,
    compact = false,
  ) => {
    const item = QUICK_ITEMS.find((i) => i.mode === targetMode);
    if (!item) return null;
    return (
      <button
        type="button"
        onClick={returnToNeutral}
        title="Revenir — les pastilles ressortent"
        aria-label="Revenir au choix"
        className={cn(
          "grid shrink-0 place-items-center text-brand transition focus-visible:outline-none forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2",
          compact
            ? "size-6 self-center rounded-md hover:bg-brand-soft focus-visible:bg-brand-soft"
            : "size-9 self-start rounded-xl bg-brand-soft hover:brightness-95 focus-visible:bg-brand-soft dark:hover:brightness-110",
        )}
      >
        <AppIcon icon={item.icon} size={compact ? 16 : 18} />
      </button>
    );
  };

  const collapsed = mode !== "neutre" || neutralText.trim().length > 0;
  const isBubble = mode === "question" && askPhase === "reflexion";
  const isReponse = mode === "question" && askPhase === "reponse";
  const isJournal = mode === "journal";
  const isTask = mode === "tache";
  const hasHostGutter = mode === "neutre" && !collapsed;
  const taskHeight = Math.max(Math.ceil(height ?? TASK_MIN_HEIGHT), TASK_MIN_HEIGHT);
  const taskWindowHeight = Math.max(
    taskOverlayHeight ?? BAR_TRANSITION_CANVAS.height,
    taskHeight,
  );
  const activeHeight = TASK_MIN_HEIGHT;
  const shellRadius = isReponse ? 0 : isBubble ? 32 : mode === "neutre" ? 26 : 20;
  const shellWidth = isBubble
    ? 64
    : isReponse
      ? answerSize.width
      : isJournal
        ? journalSize.width
        : collapsed
          ? ACTIVE_BAR_WIDTH
          : BAR_WIDTH;
  const shellHeight = isBubble
    ? 64
    : isReponse
      ? answerSize.height
      : isJournal
        ? journalSize.height
        : isTask
          ? taskHeight
        : collapsed
          ? activeHeight
          : height ?? 52;
  const sceneKey = isBubble ? "reflexion" : isReponse ? "reponse" : mode;
  const nativeScene = isBubble
    ? "reflexion"
    : isReponse
      ? "reponse"
      : isJournal
        ? "journal"
        : isTask
          ? "tache"
        : collapsed
          ? "active-bar"
          : "neutre";
  const canDismissFromBackdrop = !isBubble && !isReponse && !isJournal;

  // Une barre globale doit vivre dans une vraie petite fenêtre native, pas
  // dans un webview transparent de la taille du bureau : ce dernier avale le
  // premier clic hors surface. On choisit le moniteur sous le pointeur au
  // moment de l'ouverture (donc aussi sur un second écran), puis on centre la
  // scène. Les pixels physiques évitent tout décalage avec les écrans à DPI
  // différents sous Windows.
  const fitNativeWindow = useCallback(async (next: { width: number; height: number }) => {
    // Les appels WRY sont asynchrones. Les laisser partir en parallèle fait
    // parfois appliquer une ancienne géométrie après une nouvelle, surtout
    // lorsqu'un Journal est refermé puis rouvert rapidement. Une file garde
    // seulement la dernière intention et sérialise taille + position.
    queuedNativeSizeRef.current = next;
    if (nativeResizeRunningRef.current) return;

    nativeResizeRunningRef.current = true;
    try {
      while (queuedNativeSizeRef.current) {
        const target = queuedNativeSizeRef.current;
        queuedNativeSizeRef.current = null;
        const win = getCurrentWindow();
        const pointer = await cursorPosition();
        const monitor = await monitorFromPoint(pointer.x, pointer.y);
        const scale = monitor?.scaleFactor ?? (await win.scaleFactor());
        const size = new PhysicalSize(
          Math.round(target.width * scale),
          Math.round(target.height * scale),
        );

        if (monitor) {
          const area = monitor.workArea;
          // Les deux messages doivent atteindre Windows dans le même tour :
          // `setSize` puis `setPosition` laissait une frame au mauvais centre
          // quand une grande scène redevenait une barre.
          await Promise.all([
            win.setSize(size),
            win.setPosition(
              new PhysicalPosition(
                area.position.x + Math.round((area.size.width - size.width) / 2),
                area.position.y + Math.round((area.size.height - size.height) / 2),
              ),
            ),
          ]);
        } else {
          await win.setSize(size);
        }
        nativeSizeRef.current = target;
      }
    } catch {
      // Hors Tauri, les transitions web restent vérifiables dans le DOM.
    } finally {
      nativeResizeRunningRef.current = false;
    }
  }, []);

  const finishNativeContraction = useCallback(() => {
    const pending = pendingNativeSizeRef.current;
    if (!pending) return;
    pendingNativeSizeRef.current = null;
    void fitNativeWindow(pending);
  }, [fitNativeWindow]);

  // Les menus Radix sont portés dans un portail : ils sortent du DOM de la
  // barre, mais pas du webview natif. La barre nous signale donc l'ouverture
  // avant le premier rendu du menu : on réserve une zone stable, puis on la
  // mesure après le repositionnement de Radix.
  useEffect(() => {
    if (!isTask || !taskOverlayOpen) {
      taskOverlayPrimed.current = false;
      setTaskOverlayHeight(null);
      return;
    }

    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const popovers = Array.from(
        document.querySelectorAll<HTMLElement>("[data-radix-popper-content-wrapper]"),
      ).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (!taskOverlayPrimed.current) {
        taskOverlayPrimed.current = true;
        setTaskOverlayHeight(TASK_OVERLAY_FALLBACK_HEIGHT);
        // Le gestionnaire de fenêtres redimensionne hors du frame courant ;
        // une seconde mesure récupère la position finale de Radix.
        settleTimer = setTimeout(() => {
          frame = requestAnimationFrame(measure);
        }, 90);
        return;
      }

      // Pendant la création du portail, garder la réserve initiale évite que
      // le menu soit coupé entre deux frames.
      if (popovers.length === 0) return;

      const bottom = Math.max(...popovers.map((element) => element.getBoundingClientRect().bottom));
      const next = Math.max(taskHeight, Math.ceil(bottom + TASK_OVERLAY_MARGIN));
      setTaskOverlayHeight((current) => (current === next ? current : next));
    };

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "style"],
    });
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [isTask, taskHeight, taskOverlayOpen]);

  // À chaque frontière visuelle, on redimensionne la fenêtre une fois. Motion
  // anime alors le contenu dans ce cadre ; il ne pilote jamais la fenêtre à
  // chaque frame, ce qui éviterait les saccades du gestionnaire de fenêtres.
  useEffect(() => {
    const target = nativeScene === "reponse"
      ? RESPONSE_DEFAULT_SIZE
      : nativeScene === "journal"
        ? journalSizeRef.current
        : BAR_TRANSITION_CANVAS;

    const current = nativeSizeRef.current;
    const mustGrowFirst = target.width > current.width || target.height > current.height;
    if (mustGrowFirst) {
      pendingNativeSizeRef.current = null;
      void fitNativeWindow(target);
    } else if (target.width !== current.width || target.height !== current.height) {
      // Le webview garde la plus grande scène pendant que le shell se replie.
      // `onAnimationComplete` applique cette taille une fois le morph fini.
      pendingNativeSizeRef.current = target;
    }
    const win = getCurrentWindow();
    const isResizable = nativeScene === "reponse" || nativeScene === "journal";
    void Promise.all([
      win.setResizable(isResizable),
      win.setSizeConstraints(
        nativeScene === "reponse"
          ? {
              minWidth: RESPONSE_MIN_SIZE.width,
              minHeight: RESPONSE_MIN_SIZE.height,
              maxWidth: RESPONSE_MAX_SIZE.width,
              maxHeight: RESPONSE_MAX_SIZE.height,
            }
          : nativeScene === "journal"
            ? {
                minWidth: JOURNAL_MIN_SIZE.width,
                minHeight: JOURNAL_MIN_SIZE.height,
                maxWidth: JOURNAL_MAX_SIZE.width,
                maxHeight: JOURNAL_MAX_SIZE.height,
              }
            : null,
      ),
    ]).catch(() => {});
  }, [fitNativeWindow, nativeScene, revealEpoch]);

  // La fenêtre Tâche ne suit le document qu'après avoir dépassé l'enveloppe
  // de transition. Ainsi, une ligne qui se réorganise ne redimensionne pas le
  // webview sous une animation en cours ; un vrai brouillon long grandit bien.
  useEffect(() => {
    if (!isTask) return;
    void fitNativeWindow({ width: BAR_TRANSITION_CANVAS.width, height: taskWindowHeight });
  }, [fitNativeWindow, isTask, taskWindowHeight]);

  // Le panneau réponse délègue le redimensionnement à la fenêtre native : on
  // profite du comportement Windows attendu (bords et coins) et son contenu
  // suit la taille réelle du webview. Aucun faux handle ne se bloque au bord
  // d'une petite fenêtre.
  useEffect(() => {
    const bounds = isReponse
      ? { min: RESPONSE_MIN_SIZE, max: RESPONSE_MAX_SIZE, onSize: setAnswerSize }
      : isJournal
        ? { min: JOURNAL_MIN_SIZE, max: JOURNAL_MAX_SIZE, onSize: updateJournalSize }
        : null;
    if (!bounds) return;

    const syncAnswerSize = () => {
      const next = {
        width: clamp(window.innerWidth, bounds.min.width, bounds.max.width),
        height: clamp(window.innerHeight, bounds.min.height, bounds.max.height),
      };
      bounds.onSize(next);

      // WRY applique ces contraintes aux gestes utilisateur. Ce second filet
      // couvre aussi un éventuel redimensionnement imposé par Windows ou une
      // autre commande native : le cadre et la surface restent toujours de la
      // même taille, sans zone transparente résiduelle.
      if (next.width !== window.innerWidth || next.height !== window.innerHeight) {
        const win = getCurrentWindow();
        win
          .scaleFactor()
          .then((scale) =>
            win.setSize(
              new PhysicalSize(
                Math.round(next.width * scale),
                Math.round(next.height * scale),
              ),
            ),
          )
          .catch(() => {});
      }
    };
    window.addEventListener("resize", syncAnswerSize);
    return () => window.removeEventListener("resize", syncAnswerSize);
  }, [isJournal, isReponse, updateJournalSize]);

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      canDismissFromBackdrop &&
      !isOverlayOpen() &&
      !surfaceRef.current?.contains(event.target as Node)
    ) {
      hide();
    }
  };

  return (
    <div
      onPointerDown={handleBackdropPointerDown}
      className={cn(
        "flex h-screen w-screen justify-center bg-transparent",
        taskOverlayHeight === null ? "items-center" : "items-start",
        hasHostGutter && "p-1.5",
      )}
    >
      <motion.div
        ref={surfaceRef}
        style={{ gap: collapsed ? 0 : 14 }}
        className="relative flex items-center transition-[gap] duration-[580ms]"
      >
          <motion.div
            animate={{ width: shellWidth, height: shellHeight, borderRadius: shellRadius }}
            transition={{ duration: MORPH_DURATION, ease: MORPH_EASE }}
            onAnimationComplete={finishNativeContraction}
            className={cn(
              "relative shrink-0 overflow-hidden border border-transparent bg-popover",
              "transition-[border-color,box-shadow] duration-[580ms]",
              isReponse || isJournal ? "border-border/70 shadow-none" : "shadow-floating",
            )}
          >
            <div className="relative h-full w-full">
              <AnimatePresence initial={false} mode="sync">
                <motion.div
                  ref={isJournal || isReponse || isBubble ? undefined : measureScene}
                  key={sceneKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: MORPH_EASE }}
                  className={cn(
                    "w-full",
                    isReponse || isJournal
                      ? "absolute inset-0 h-full"
                      : "absolute inset-x-0 top-1/2 -translate-y-1/2",
                  )}
                >
                  {mode === "neutre" && (
                    <BarreAssistant
                      key={`neutre-${mountKey}`}
                      value={neutralText}
                      onValueChange={handleNeutralChange}
                      onSubmit={handleNeutralSubmit}
                      placeholder="Écrire, capturer, demander…"
                      autoFocus
                      variant="inline"
                    />
                  )}
                  {mode === "tache" && (
                    <BarreTache
                      key={`tache-${mountKey}`}
                      variant="inline"
                      autoFocus
                      onSubmit={handleSubmit}
                      placeholder="Capturer une tâche…"
                      lists={lists}
                      leading={returnBadge("tache", true)}
                      showControls={false}
                      onOverlayChange={setTaskOverlayOpen}
                    />
                  )}
                  {mode === "journal" && (
                    <BarreJournal
                      key={`journal-${mountKey}`}
                      autoFocus
                      leading={returnBadge("journal", true)}
                      onOpenInJournal={handleOpenInJournal}
                      onClose={hide}
                    />
                  )}
                  {mode === "question" && askPhase === "idle" && (
                    <BarreAssistant
                      key={`question-${mountKey}`}
                      autoFocus
                      onSubmit={handleAskSubmit}
                      placeholder="Demander, créer, chercher…"
                      leading={returnBadge("question", true)}
                      variant="inline"
                    />
                  )}
                  {isBubble && <QuickBubble />}
                  {isReponse && (
                    <QuickAnswer
                      turns={turns}
                      pending={pending}
                      onFollowUp={handleFollowUp}
                      leading={returnBadge("question", true)}
                      onOpenInAssistant={handleOpenInAssistant}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>

          <QuickPills collapsed={collapsed} onChoose={switchMode} entryKey={mountKey} />
      </motion.div>
    </div>
  );
}
