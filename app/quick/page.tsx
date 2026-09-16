"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "motion/react";
import BarreTache from "@/components/BarreTache";
import BarreJournal from "@/components/BarreJournal";
import BarreAssistant from "@/components/BarreAssistant";
import QuickNeutral from "@/components/QuickNeutral";
import { QuickPills, QUICK_ITEMS, type QuickMode } from "@/components/QuickPills";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

/**
 * Barre de capture rapide (style Spotlight) : la fenêtre `quick` est une barre
 * flottante transparente. On l'ouvre via le raccourci global (Alt+Q) ou le
 * tray. Elle se ferme après validation (mode Tâche), sur Échap, ou quand elle
 * perd le focus (clic ailleurs / changement d'application).
 *
 * La fenêtre a une taille FIXE (voir `src-tauri/tauri.conf.json`, label
 * `quick`) ; ce qui morphe, c'est le CONTENU à l'intérieur
 * (docs/ROADMAP-BARRES.md étape 4, deuxième sous-étape — revue après un
 * premier essai qui gardait Tâche comme barre par défaut plutôt qu'un vrai
 * neutre, corrigé ici).
 *
 * Quatre états : le NEUTRE (rien n'est choisi, `QuickNeutral`) et les trois
 * vraies barres (`BarreTache`/`BarreJournal`/`BarreAssistant`). Deux chemins
 * vers un mode, comme dans l'artifact « La fenêtre rapide » :
 * - cliquer une pastille (`QuickPills`) ;
 * - taper son mot en tête du champ neutre, suivi d'une espace — le mot ne
 *   revient PAS dans la barre choisie (elle démarre vide), à la différence
 *   de l'artifact : reporter le texte demanderait une prop `initialValue`
 *   sur les trois barres, pas ajoutée pour l'instant.
 *
 * Retour au neutre : l'icône de tête de la barre active (posée ici via sa
 * prop `leading`) redonne la main aux pastilles. Sans elle, Journal et
 * Question seraient des portes sans retour tant que la fenêtre reste ouverte.
 *
 * `mountKey` s'incrémente à CHAQUE vraie réouverture (pas un simple regain de
 * focus) et repose sur le neutre : revenir au neutre est prévisible, cohérent
 * avec « rien n'est choisi par défaut » de l'artifact (question 02 du
 * roadmap, tranchée ainsi).
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
  const wasHidden = useRef(true);

  const hide = useCallback(() => {
    wasHidden.current = true;
    invoke("hide_quick_window").catch(() => {});
  }, []);

  const switchMode = useCallback((next: Exclude<QuickMode, "neutre">) => {
    setMode(next);
    setNeutralText("");
  }, []);

  const returnToNeutral = useCallback(() => {
    setMode("neutre");
    setNeutralText("");
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

  // Focus + reset à l'affichage ; fermeture au blur.
  useEffect(() => {
    const win = getCurrentWindow();
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (blurTimer) clearTimeout(blurTimer);
        if (wasHidden.current) {
          wasHidden.current = false;
          setMode("neutre");
          setNeutralText("");
          setMountKey((k) => k + 1);
        }
        return;
      }

      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus() && !isOverlayOpen()) hide();
      }, 120);
    });

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      unlisten.then((stop) => stop());
    };
  }, [hide]);

  // Échap → fermer.
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

  // Intérimaire (troisième sous-étape de l'étape 4 la remplacera par la
  // bulle de réflexion + réponse) : on ne peut pas encore répondre ICI, et
  // appeler l'agent pour jeter sa réponse serait pire que ne rien faire (~12s
  // d'attente invisible avant que la fenêtre disparaisse). On ouvre donc la
  // fenêtre principale sans poser la question à sa place — honnête sur ce
  // que ça fait, pas encore ce que ça devrait faire. Même chemin pour une
  // question posée via la pastille Question OU tapée en clair dans le champ
  // neutre : les deux « vont vers l'assistant ».
  const goToAssistant = useCallback(() => {
    hide();
    invoke("show_main_window").catch(() => {});
  }, [hide]);

  const handleNeutralSubmit = useCallback(() => {
    if (!neutralText.trim()) return;
    goToAssistant();
  }, [neutralText, goToAssistant]);

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

  /** Icône de tête cliquable, posée dans la barre active — le seul chemin de retour au neutre. */
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

  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent">
      <div className="w-full p-7">
        <div className="flex items-start gap-3.5">
          <motion.div
            animate={{ height: height ?? "auto" }}
            transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 flex-1 overflow-hidden rounded-2xl shadow-floating"
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
              {mode === "question" && (
                <BarreAssistant
                  key={`question-${mountKey}`}
                  autoFocus
                  onSubmit={goToAssistant}
                  placeholder="Demander, créer, chercher…"
                  leading={returnBadge("question")}
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
