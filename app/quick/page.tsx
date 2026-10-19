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

const BAR_WIDTH = 420;
const ACTIVE_BAR_WIDTH = 520;
const TASK_MIN_HEIGHT = 52;
/** La marge au-dessus de la barre, dans la toile : la place de son ombre.
 *  À TENIR IDENTIQUE à `MARGE_HAUT` dans src-tauri/src/cadre/mod.rs. */
const MARGE_HAUT = 24;
const RESPONSE_WIDTH = 440;
const RESPONSE_MIN_HEIGHT = 272;
const RESPONSE_MAX_HEIGHT = 560;
const JOURNAL_SIZE = { width: 680, height: 600 };
// Mouvement posé, sans rebond : la surface est un objet dense, pas une
// notification. Cette courbe est partagée par toute la scène rapide.
const MORPH_EASE = [0.22, 0.9, 0.28, 1] as const;
const MORPH_DURATION = 0.58;

/** La réponse que montre l'essai automatique (voir `quick:essai-scene`). */
const REPONSE_ESSAI = [
  "Trois choses comptent aujourd’hui :",
  [
    "- relire le dossier de presse avant midi ;",
    "- réserver l’hôtel pour Lisbonne ;",
    "- appeler le dentiste pour décaler le rendez-vous.",
  ].join("\n"),
  "Le reste peut attendre demain.",
].join("\n\n");

/**
 * Ce que la toile tient pour cliquable : la barre (`data-forme`), les
 * pastilles (`data-forme`), les menus de Radix et les toasts. Ailleurs, les
 * clics la traversent (voir src-tauri/src/cadre).
 */
const SELECTEUR_FORMES = "[data-forme], [data-radix-popper-content-wrapper] > *, [data-sonner-toast]";

function isOverlayOpen() {
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Barre de capture rapide (style Spotlight) : une TOILE transparente, de
 * taille fixe, où la barre se métamorphose — capsule, bulle de réflexion,
 * panneau de réponse, Journal — et où ses pastilles flottent à côté d'elle.
 *
 * Seules les formes peintes existent pour la souris : la page les annonce à
 * Rust à chaque mouvement (`quick_formes`), et Rust rend la fenêtre
 * traversante dès que le pointeur les quitte. Un clic à côté de la barre
 * atteint donc l'application d'en dessous. La toile est posée une fois à
 * l'ouverture (l'écran du pointeur, au cinquième haut) et ne bouge plus :
 * la barre s'accroche en haut et tout se déplie vers le bas.
 *
 * Sur Mac, l'ombre est celle du système — elle suit chaque forme, même en
 * pleine métamorphose ; sous Windows, elle est dessinée ici.
 *
 * On l'ouvre via le raccourci global ou le tray. Elle se ferme après
 * validation (mode Tâche), sur Échap, ou quand elle perd le focus — SAUF
 * pendant qu'une question est en cours de réflexion ou de réponse, ou dans
 * le Journal.
 *
 * Pour une question : `reflexion` (`QuickBubble`, un cercle) puis `reponse`
 * (`QuickAnswer`). Une relance depuis `reponse` NE repasse PAS par la bulle.
 * Pas de bouton d'annuler pendant `reflexion` (décision utilisateur,
 * 2026-09-16) : c'est un processus de réflexion. Échap reste le filet
 * global.
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
  const [answerHeight, setAnswerHeight] = useState(RESPONSE_MIN_HEIGHT);
  const [height, setHeight] = useState<number | undefined>(undefined);
  /** La barre est montrée : c'est le seul moment où l'on suit ses formes. */
  const [ouverte, setOuverte] = useState(false);
  const pendingRef = useRef(false); // garde de réentrance, voir assistant/page.tsx
  const wasHidden = useRef(true);
  /** Mode imposé à la PROCHAINE ouverture, une seule fois (l'accueil ouvre ainsi la fenêtre en mode Tâche). */
  const nextModeRef = useRef<Exclude<QuickMode, "neutre"> | null>(null);
  /** L'essai automatique est en cours : personne ne regarde. */
  const essaiRef = useRef(false);

  // La règle CSS qui retire les ombres dessinées sur Mac (l'ombre y est
  // celle du système) se règle sur <html> : les menus de Radix sont portés
  // hors de la page, sous <body>.
  useEffect(() => {
    document.documentElement.dataset.plateforme = mac ? "mac" : "autre";
  }, [mac]);

  const resetAsk = useCallback(() => {
    setAskPhase("idle");
    setTurns([]);
    setAnswerHeight(RESPONSE_MIN_HEIGHT);
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
    setOuverte(false);
    flushSync(resetQuickSurface);
    invoke("hide_quick_window").catch(() => {});
  }, [resetQuickSurface]);

  useEffect(() => {
    const unlisten = listen("quick:will-hide", () => {
      // Le raccourci global cache la fenêtre directement. On remet la scène
      // au neutre avant la prochaine ouverture, pour qu'elle ne se
      // métamorphose jamais depuis un contenu périmé.
      if (wasHidden.current) return;

      wasHidden.current = true;
      setOuverte(false);
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
          setOuverte(true);
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
        if (essaiRef.current) return;
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

  // Les FORMES de la toile, annoncées à Rust à chaque changement : ce sont
  // elles qui décident où la souris est captée, et où elle traverse. La
  // boucle ne tourne que barre ouverte — une fenêtre cachée ne passe pas
  // toujours `document.hidden`, et une boucle par image toute la journée
  // viderait la batterie. Elle n'envoie rien tant que rien ne bouge.
  useEffect(() => {
    if (!ouverte) return;
    let image = 0;
    let precedent = "";
    const tour = () => {
      const formes = Array.from(document.querySelectorAll<HTMLElement>(SELECTEUR_FORMES))
        .map((element) => {
          const r = element.getBoundingClientRect();
          return {
            x: r.left,
            y: r.top,
            largeur: r.width,
            hauteur: r.height,
            // L'arrondi suit la métamorphose : on le relit à chaque image.
            rayon: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
          };
        })
        .filter((f) => f.largeur > 1 && f.hauteur > 1);
      const cle = formes
        .map((f) => [f.x, f.y, f.largeur, f.hauteur, f.rayon].map(Math.round).join(","))
        .join(";");
      if (cle !== precedent) {
        precedent = cle;
        invoke("quick_formes", { formes }).catch(() => {});
      }
      image = requestAnimationFrame(tour);
    };
    image = requestAnimationFrame(tour);
    return () => cancelAnimationFrame(image);
  }, [ouverte]);

  // L'ESSAI AUTOMATIQUE (src-tauri/src/cadre, `essai_si_demande`) : Rust
  // annonce une scène, la page s'y met. C'est ce qui permet à la CI macOS de
  // photographier chaque état de la barre sans personne devant l'écran — et
  // sans appeler l'IA. L'événement n'est émis que si l'app a été lancée avec
  // `LISTIK_ESSAI_RAPIDE`.
  useEffect(() => {
    const question = "Que dois-je faire aujourd'hui ?";
    const unlisten = listen<string>("quick:essai-scene", ({ payload }) => {
      essaiRef.current = true;
      wasHidden.current = false;
      setOuverte(true);
      const racine = document.documentElement;
      switch (payload) {
        case "neutre":
        case "neutre-sombre":
          resetQuickSurface();
          break;
        case "saisie":
          resetQuickSurface();
          setNeutralText("Acheter du pain demain");
          break;
        case "tache":
          switchMode("tache");
          break;
        case "journal":
          switchMode("journal");
          break;
        case "reflexion":
          switchMode("question");
          setTurns([{ id: "essai", question }]);
          setPending(true);
          setAskPhase("reflexion");
          break;
        case "reponse":
          setTurns([{ id: "essai", question, answer: REPONSE_ESSAI }]);
          setPending(false);
          setAskPhase("reponse");
          break;
        case "reponse-sombre":
          racine.classList.add("dark");
          break;
        case "retour":
          racine.classList.remove("dark");
          resetQuickSurface();
          break;
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [resetQuickSurface, switchMode]);

  const handleSubmit = useCallback(
    async (data: SmartTaskData) => {
      await captureTask(data);
      hide();
    },
    [captureTask, hide],
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
  // en panneau réponse — jamais l'inverse (le panneau n'a pas d'état
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

  // Le panneau réponse grandit avec la conversation, jusqu'à une hauteur au
  // delà de laquelle c'est son fil qui défile.
  const surAnswerHeight = useCallback((naturelle: number) => {
    const next = clamp(naturelle, RESPONSE_MIN_HEIGHT, RESPONSE_MAX_HEIGHT);
    setAnswerHeight((current) => (current === next ? current : next));
  }, []);

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
  const taskHeight = Math.max(Math.ceil(height ?? TASK_MIN_HEIGHT), TASK_MIN_HEIGHT);
  const activeHeight = TASK_MIN_HEIGHT;
  // Le panneau réponse a des coins, lui aussi : il n'est plus la fenêtre
  // entière, mais une forme posée dans la toile.
  const shellRadius = isReponse || isJournal ? 22 : isBubble ? 32 : mode === "neutre" ? 26 : 20;
  const shellWidth = isBubble
    ? 64
    : isReponse
      ? RESPONSE_WIDTH
      : isJournal
        ? JOURNAL_SIZE.width
        : collapsed
          ? ACTIVE_BAR_WIDTH
          : BAR_WIDTH;
  const shellHeight = isBubble
    ? 64
    : isReponse
      ? answerHeight
      : isJournal
        ? JOURNAL_SIZE.height
        : isTask
          ? taskHeight
        : collapsed
          ? activeHeight
          : height ?? 52;
  const sceneKey = isBubble ? "reflexion" : isReponse ? "reponse" : mode;

  return (
    <div
      className="flex h-screen w-screen justify-center bg-transparent"
      style={{ paddingTop: MARGE_HAUT }}
    >
      <motion.div
        style={{ gap: collapsed ? 0 : 14 }}
        className="relative flex items-start transition-[gap] duration-[580ms]"
      >
          <motion.div
            // Une forme cliquable de la toile (voir src-tauri/src/cadre).
            data-forme
            // Née à sa taille : grandie depuis zéro, elle ferait mesurer au
            // champ sa hauteur sur une largeur nulle — et il la garderait.
            initial={false}
            animate={{ width: shellWidth, height: shellHeight, borderRadius: shellRadius }}
            transition={{ duration: MORPH_DURATION, ease: MORPH_EASE }}
            className={cn(
              "relative shrink-0 overflow-hidden border border-transparent bg-popover shadow-floating",
              "transition-[border-color] duration-[580ms]",
              (isReponse || isJournal) && "border-border/70",
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
                      onHauteurNaturelle={surAnswerHeight}
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
