"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { motion } from "motion/react";
import BarreTache from "@/components/BarreTache";
import BarreJournal from "@/components/BarreJournal";
import BarreAssistant from "@/components/BarreAssistant";
import QuickNeutral from "@/components/QuickNeutral";
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
import { cn } from "@/lib/utils";

type AskPhase = "idle" | "reflexion" | "reponse";

/**
 * Barre de capture rapide (style Spotlight) : la fenêtre `quick` est une barre
 * flottante transparente. On l'ouvre via le raccourci global (Alt+Q) ou le
 * tray. Elle se ferme après validation (mode Tâche), sur Échap, ou quand elle
 * perd le focus (clic ailleurs / changement d'application) — SAUF pendant
 * qu'une question est en cours de réflexion ou de réponse, voir plus bas.
 *
 * La fenêtre a une taille FIXE (voir `src-tauri/tauri.conf.json`, label
 * `quick`) ; ce qui morphe, c'est le CONTENU à l'intérieur
 * (docs/ROADMAP-BARRES.md étape 4).
 *
 * États : le NEUTRE, les trois vraies barres, et — dans le mode Question —
 * deux sous-états supplémentaires : `reflexion` (`QuickBubble`, un cercle
 * qui réutilise le filtre gooey des pastilles) puis `reponse`
 * (`QuickAnswer`, plus étroite que la barre). Une relance depuis `reponse`
 * NE repasse PAS par la bulle — seule la toute première question fait tout
 * le chemin.
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
  const [askPhase, setAskPhase] = useState<AskPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false); // garde de réentrance, voir assistant/page.tsx
  const wasHidden = useRef(true);

  const hide = useCallback(() => {
    wasHidden.current = true;
    invoke("hide_quick_window").catch(() => {});
  }, []);

  const resetAsk = () => {
    setAskPhase("idle");
    setTurns([]);
    pendingRef.current = false;
    setPending(false);
  };

  const switchMode = useCallback((next: Exclude<QuickMode, "neutre">) => {
    setMode(next);
    setNeutralText("");
    resetAsk();
  }, []);

  const returnToNeutral = useCallback(() => {
    setMode("neutre");
    setNeutralText("");
    resetAsk();
  }, []);

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
    const askBusy = mode === "question" && askPhase !== "idle";

    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (blurTimer) clearTimeout(blurTimer);
        if (wasHidden.current) {
          wasHidden.current = false;
          setMode("neutre");
          setNeutralText("");
          resetAsk();
          setMountKey((k) => k + 1);
        }
        return;
      }

      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus() && !isOverlayOpen() && !askBusy) hide();
      }, 120);
    });

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      unlisten.then((stop) => stop());
    };
  }, [hide, mode, askPhase]);

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
        console.error("ai_agent_run:", e);
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, error: true, answer: "L'assistant est indisponible (CLI introuvable, ou délai dépassé)." }
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
      void askQuestion(text).then(() => setAskPhase("reponse"));
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

  // --- Morphing de hauteur : un seul ResizeObserver sur le cadre (posé une
  // fois, jamais recréé — l'élément observé ne change pas d'identité, seul
  // son contenu est remplacé), qui anime le CADRE vers la hauteur mesurée.
  // Jamais de `layout` de motion ici : il applique un scale qui écrase le
  // contenu pendant la transition (piège documenté lors de la refonte
  // Omnibar du 2026-08-24). Courbe `--sortie` de l'artifact
  // (cubic-bezier(0.16,1,0.3,1)), pas les presets de lib/motion.ts : c'est le
  // ressenti approuvé sur la maquette, pas le vocabulaire général de l'app.
  const measureRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setHeight(entries[0]?.contentRect.height ?? el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Icône de tête cliquable, posée dans la barre/le panneau actif — le seul chemin de retour au neutre. */
  const returnBadge = (targetMode: Exclude<QuickMode, "neutre">) => {
    const item = QUICK_ITEMS.find((i) => i.mode === targetMode);
    if (!item) return null;
    const Icon = item.icon;
    return (
      <button
        type="button"
        onClick={returnToNeutral}
        title="Revenir — les pastilles ressortent"
        aria-label="Revenir au choix"
        className="grid size-9 shrink-0 place-items-center self-start rounded-xl transition hover:brightness-95 dark:hover:brightness-110"
        style={{ backgroundColor: `${item.color}1f`, color: item.color }}
      >
        <Icon className="size-[18px]" />
      </button>
    );
  };

  const collapsed = mode !== "neutre" || neutralText.trim().length > 0;
  const isBubble = mode === "question" && askPhase === "reflexion";
  const isReponse = mode === "question" && askPhase === "reponse";
  const shellRadius = isBubble ? 9999 : mode === "neutre" ? 9999 : 16;
  const shellWidth = isBubble ? 64 : isReponse ? 420 : undefined;

  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent">
      <div className="w-full p-7">
        <div className="flex items-start gap-3.5">
          <motion.div
            animate={{ height: height ?? "auto", borderRadius: shellRadius }}
            transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "overflow-hidden bg-popover shadow-floating",
              shellWidth ? "flex-none" : "min-w-0 flex-1",
            )}
            style={{
              width: shellWidth,
              transitionProperty: "width",
              transitionDuration: "440ms",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div ref={measureRef}>
              {mode === "neutre" && (
                <QuickNeutral
                  key={`neutre-${mountKey}`}
                  value={neutralText}
                  onChange={handleNeutralChange}
                  onSubmit={handleNeutralSubmit}
                  autoFocus
                />
              )}
              {mode === "tache" && (
                <BarreTache
                  key={`tache-${mountKey}`}
                  autoFocus
                  onSubmit={handleSubmit}
                  placeholder="Capturer une tâche…"
                  lists={lists}
                  leading={returnBadge("tache")}
                />
              )}
              {mode === "journal" && (
                <BarreJournal
                  key={`journal-${mountKey}`}
                  autoFocus
                  leading={returnBadge("journal")}
                />
              )}
              {mode === "question" && askPhase === "idle" && (
                <BarreAssistant
                  key={`question-${mountKey}`}
                  autoFocus
                  onSubmit={handleAskSubmit}
                  placeholder="Demander, créer, chercher…"
                  leading={returnBadge("question")}
                />
              )}
              {isBubble && <QuickBubble />}
              {isReponse && (
                <QuickAnswer
                  turns={turns}
                  pending={pending}
                  onFollowUp={handleFollowUp}
                  leading={returnBadge("question")}
                  onOpenInAssistant={handleOpenInAssistant}
                />
              )}
            </div>
          </motion.div>

          <QuickPills collapsed={collapsed} onChoose={switchMode} entryKey={mountKey} />
        </div>
      </div>
    </div>
  );
}
