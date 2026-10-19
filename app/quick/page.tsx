"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { AppIcon } from "@/components/ui/app-icon";
import BarreTache from "@/components/BarreTache";
import BarreJournal from "@/components/BarreJournal";
import BarreAssistant from "@/components/BarreAssistant";
import { QuickBubble } from "@/components/QuickBubble";
import { QuickAnswer } from "@/components/QuickAnswer";
import { QuickPills, QUICK_ITEMS, QUICK_NEXT_MODE_EVENT, type QuickMode } from "@/components/QuickPills";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { useCaptureTask } from "@/features/todos/useCaptureTask";
import { useProjects } from "@/hooks/useProjects";
import type { SmartTaskData } from "@/features/todos/useTaskMode";
import { aiAgent } from "@/features/omnibar/agent";
import { buildHistory, QUICK_OPEN_ASSISTANT_EVENT, type Turn } from "@/features/assistant/conversation";
import { QUICK_OPEN_JOURNAL_EVENT } from "@/features/journal/quick";
import { useIsMac } from "@/lib/keys";
import { cn } from "@/lib/utils";

type AskPhase = "idle" | "reflexion" | "reponse";

/** La largeur unique de la barre et de tout ce qui s'en déplie. */
const LARGEUR = 600;
/** La hauteur d'une barre au repos. */
const HAUTEUR_BARRE = 56;
/** Le Journal est un panneau d'écriture : une hauteur fixe, généreuse. */
const HAUTEUR_JOURNAL = 480;
const TASK_OVERLAY_FALLBACK_HEIGHT = 460;
const TASK_OVERLAY_MARGIN = 12;
/** Le fondu d'entrée d'une scène — la fenêtre, elle, a déjà sa taille. */
const ENTREE = { duration: 0.2, ease: [0.22, 0.9, 0.28, 1] as const };

function isOverlayOpen() {
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}

/**
 * Résout une couleur CSS (oklch, color-mix…) en octets sRGB, en la peignant
 * sur un pixel. `dessous` est peint d'abord : une couleur translucide (le
 * liseré du thème sombre) se lit alors telle qu'elle apparaît sur le fond.
 */
function enOctets(couleur: string, dessous?: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  if (dessous) {
    ctx.fillStyle = dessous;
    ctx.fillRect(0, 0, 1, 1);
  }
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

/**
 * Barre de capture rapide, construite comme Spotlight et les barres de
 * Windows : la FENÊTRE est la barre. Le système en trace le contour et
 * l'ombre ; un clic à côté tombe dans l'application d'en dessous.
 *
 * La géométrie est tenue par Rust (`src-tauri/src/cadre`) : l'écran et le
 * point d'ancrage sont choisis à l'ouverture, le haut reste fixe et tout se
 * déplie VERS LE BAS, à la même largeur. La page ne fait que mesurer sa
 * scène et l'annoncer (`quick_cadre`) ; le cadre grandit d'un coup — la
 * scène entre en fondu — et se resserre en s'animant.
 *
 * Scènes : la barre neutre (l'Assistant, avec les pastilles Tâche et Journal
 * DANS la barre), les deux outils de capture, et pour une question : la
 * réflexion (la présence animée prend la place du bouton d'envoi, dans la
 * barre) puis la conversation, qui se déplie sous le champ.
 *
 * On l'ouvre par le raccourci global ou le tray. Elle se ferme après
 * validation (mode Tâche), sur Échap, ou quand elle perd le focus — SAUF
 * pendant une question ou dans le Journal, voir plus bas.
 *
 * Pas de bouton d'annuler pendant la réflexion (décision utilisateur,
 * 2026-09-16) : c'est un processus de réflexion. Échap reste le filet global.
 *
 * Ouvrir dans l'Assistant transmet la DERNIÈRE question/réponse par un
 * événement front-à-front (`QUICK_OPEN_ASSISTANT_EVENT`).
 */
export default function QuickPage() {
  useTodosSync();
  const mac = useIsMac();
  const captureTask = useCaptureTask();
  const { projects } = useProjects();
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
  const [askPhase, setAskPhase] = useState<AskPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [taskOverlayHeight, setTaskOverlayHeight] = useState<number | null>(null);
  const [taskOverlayOpen, setTaskOverlayOpen] = useState(false);
  const [sceneHeight, setSceneHeight] = useState(HAUTEUR_BARRE);
  const pendingRef = useRef(false); // garde de réentrance, voir assistant/page.tsx
  const wasHidden = useRef(true);
  /** Mode imposé à la PROCHAINE ouverture, une seule fois (l'accueil ouvre ainsi la fenêtre en mode Tâche). */
  const nextModeRef = useRef<Exclude<QuickMode, "neutre"> | null>(null);
  const taskOverlayPrimed = useRef(false);

  const resetAsk = useCallback(() => {
    setAskPhase("idle");
    setTurns([]);
    pendingRef.current = false;
    setPending(false);
  }, []);

  // La fenêtre est conservée cachée entre deux raccourcis. On la remet dans
  // son état neutre AVANT de la cacher : elle se rouvrira barre, pas panneau.
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
      // Le raccourci global cache la fenêtre directement. On remet la scène
      // au neutre avant la prochaine ouverture.
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

  // Les couleurs que le SYSTÈME peint lui-même : le fond découvert pendant
  // un agrandissement, et le liseré de Windows 11. Elles suivent le thème,
  // l'accent et le mode OLED, tous posés sur <html>.
  useEffect(() => {
    const envoyer = () => {
      const style = getComputedStyle(document.documentElement);
      const popover = style.getPropertyValue("--popover").trim() || "#fff";
      const fond = enOctets(popover);
      const lisere = enOctets(style.getPropertyValue("--border").trim() || "#ccc", popover);
      invoke("quick_couleurs", { fond, lisere }).catch(() => {});
    };
    envoyer();
    const observateur = new MutationObserver(envoyer);
    observateur.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent", "data-oled"],
    });
    return () => observateur.disconnect();
  }, []);

  const switchMode = useCallback((next: Exclude<QuickMode, "neutre">) => {
    setMode(next);
    setNeutralText("");
    resetAsk();
  }, [resetAsk]);

  const returnToNeutral = useCallback(() => {
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

  useEffect(() => {
    const unlisten = listen<Exclude<QuickMode, "neutre"> | null>(QUICK_NEXT_MODE_EVENT, ({ payload }) => {
      nextModeRef.current = payload;
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

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
        }
        // Un mode imposé s'applique à la prise de focus, que la fenêtre sorte
        // d'un état caché ou non : au tout premier affichage après le
        // lancement, `wasHidden` peut déjà être tombé.
        const forced = nextModeRef.current;
        if (forced) {
          nextModeRef.current = null;
          setMode(forced);
          setNeutralText("");
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
      await captureTask(data);
      hide();
    },
    [captureTask, hide],
  );

  // Pose/complète un tour — partagé par la toute première question et les
  // relances (qui restent dans la conversation).
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

  // Première question : la présence de réflexion jusqu'à la réponse, PUIS la
  // conversation se déplie — jamais l'inverse.
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
  // tout le chemin Question — réflexion, puis conversation.
  const handleNeutralSubmit = useCallback(() => {
    const text = neutralText.trim();
    if (!text) return;
    switchMode("question");
    handleAskSubmit(text);
  }, [neutralText, switchMode, handleAskSubmit]);

  // C'est la hauteur NATURELLE de la scène qui fait celle de la fenêtre. On
  // mesure son CONTENEUR, qui ne change jamais : `popLayout` retire la scène
  // sortante du flux, si bien qu'il a toujours la hauteur de l'entrante. (Une
  // référence posée sur la scène elle-même serait écrasée par celle que
  // `popLayout` y pose pour la mesurer à son tour.)
  const sceneObserverRef = useRef<ResizeObserver | null>(null);
  const measureScene = useCallback((element: HTMLDivElement | null) => {
    sceneObserverRef.current?.disconnect();
    if (!element) return;
    const update = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      if (next > 0) setSceneHeight((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(update);
    sceneObserverRef.current = observer;
    observer.observe(element);
    update();
  }, []);
  useEffect(() => () => sceneObserverRef.current?.disconnect(), []);

  /** Icône de tête cliquable, posée dans la barre active — le seul chemin de retour au neutre. */
  const returnBadge = (targetMode: Exclude<QuickMode, "neutre">) => {
    const item = QUICK_ITEMS.find((i) => i.mode === targetMode);
    if (!item) return null;
    return (
      <button
        type="button"
        onClick={returnToNeutral}
        title="Revenir — les pastilles ressortent"
        aria-label="Revenir au choix"
        className="grid size-6 shrink-0 place-items-center self-center rounded-md text-brand transition hover:bg-brand-soft focus-visible:bg-brand-soft focus-visible:outline-none forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2"
      >
        <AppIcon icon={item.icon} size={16} />
      </button>
    );
  };

  const collapsed = mode !== "neutre" || neutralText.trim().length > 0;
  const isTask = mode === "tache";
  const sceneKey = mode === "question" ? `question-${askPhase}` : mode;

  // Les menus de la barre Tâche (date, liste, suggestions) sont portés hors
  // de la scène par Radix. La barre nous signale leur ouverture : on réserve
  // d'abord une hauteur (Radix ne place un menu que s'il a la place), puis on
  // la mesure une fois le menu posé. La fenêtre grandit pour le contenir —
  // il s'ouvre DANS le panneau, sous le champ, pas en débordement.
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
      const next = Math.ceil(bottom + TASK_OVERLAY_MARGIN);
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
  }, [isTask, taskOverlayOpen]);

  // La taille de la fenêtre : la scène, ou le menu ouvert s'il descend plus
  // bas. Rust décide du geste — d'un coup pour grandir, animé pour se
  // resserrer. Cachée, elle se remet à la taille de la barre sans animer :
  // une animation invisible pourrait encore courir à la réouverture.
  const windowHeight = Math.max(sceneHeight, isTask ? (taskOverlayHeight ?? 0) : 0);
  useEffect(() => {
    invoke("quick_cadre", {
      largeur: LARGEUR,
      hauteur: windowHeight,
      anime: !wasHidden.current,
    }).catch(() => {});
  }, [windowHeight]);

  return (
    <div
      className={cn(
        "h-screen w-screen overflow-hidden bg-popover text-foreground",
        // Sur Mac, la fenêtre est transparente et l'ombre du système suit
        // la forme peinte : la capsule de Spotlight. Sous Windows, c'est le
        // système qui arrondit les coins de la fenêtre opaque.
        mac && "rounded-[28px]",
      )}
    >
      <div ref={measureScene} className="relative w-full">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={sceneKey}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={ENTREE}
            className="w-full"
          >
            {mode === "neutre" && (
              <div className="flex h-14 items-center pr-2">
                <div className="h-full min-w-0 flex-1">
                  <BarreAssistant
                    key={`neutre-${mountKey}`}
                    value={neutralText}
                    onValueChange={handleNeutralChange}
                    onSubmit={handleNeutralSubmit}
                    placeholder="Écrire, capturer, demander…"
                    autoFocus
                    variant="inline"
                  />
                </div>
                {/* Les pastilles vivent DANS la barre : une ombre système ne
                    sait pas entourer des formes flottantes séparées. Elles
                    se replient dès qu'on écrit, et se refondent l'une dans
                    l'autre en partant. */}
                <QuickPills
                  collapsed={collapsed}
                  onChoose={switchMode}
                  entryKey={mountKey}
                  size={40}
                  gap={12}
                  shapeClassName="bg-muted"
                />
              </div>
            )}
            {mode === "tache" && (
              <div className="flex min-h-14 items-center">
                <BarreTache
                  key={`tache-${mountKey}`}
                  variant="inline"
                  autoFocus
                  onSubmit={handleSubmit}
                  placeholder="Capturer une tâche…"
                  lists={lists}
                  leading={returnBadge("tache")}
                  showControls={false}
                  onOverlayChange={setTaskOverlayOpen}
                />
              </div>
            )}
            {mode === "journal" && (
              <div style={{ height: HAUTEUR_JOURNAL }}>
                <BarreJournal
                  key={`journal-${mountKey}`}
                  autoFocus
                  leading={returnBadge("journal")}
                  onOpenInJournal={handleOpenInJournal}
                  onClose={hide}
                />
              </div>
            )}
            {mode === "question" && askPhase === "idle" && (
              <div className="h-14">
                <BarreAssistant
                  key={`question-${mountKey}`}
                  autoFocus
                  onSubmit={handleAskSubmit}
                  placeholder="Demander, créer, chercher…"
                  leading={returnBadge("question")}
                  variant="inline"
                />
              </div>
            )}
            {mode === "question" && askPhase === "reflexion" && (
              // La question reste lisible là où on l'a tapée ; la présence
              // prend la place du bouton d'envoi le temps de la réflexion.
              <div className="flex h-14 items-center gap-2 pr-2.5 pl-3">
                {returnBadge("question")}
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] text-muted-foreground">
                  {turns[0]?.question}
                </p>
                <QuickBubble size={36} />
              </div>
            )}
            {mode === "question" && askPhase === "reponse" && (
              <QuickAnswer
                turns={turns}
                pending={pending}
                onFollowUp={handleFollowUp}
                leading={returnBadge("question")}
                onOpenInAssistant={handleOpenInAssistant}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
