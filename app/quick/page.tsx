"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "motion/react";
import BarreTache from "@/components/BarreTache";
import BarreJournal from "@/components/BarreJournal";
import BarreAssistant from "@/components/BarreAssistant";
import { QuickPills, type QuickMode } from "@/components/QuickPills";
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
 * `quick`) — voir le commit précédent pour pourquoi. Ce qui morphe ici, c'est
 * le CONTENU à l'intérieur : trois pastilles (`QuickPills`) choisissent entre
 * `BarreTache`, `BarreJournal` et `BarreAssistant` (docs/ROADMAP-BARRES.md
 * étape 4, deuxième sous-étape), chacune une barre entière et autonome —
 * aucune ne sait qu'elle vit dans cette fenêtre plutôt qu'ailleurs.
 *
 * Écarts assumés vis-à-vis de l'artifact de maquettage, pas des oublis :
 * - Les pastilles restent TOUJOURS visibles et cliquables (celle du mode actif
 *   simplement teintée), plutôt que de s'absorber dans la barre choisie et de
 *   n'y redevenir accessibles qu'en défaisant un jeton. Ce va-et-vient
 *   demandait un point de retour dans chacune des trois barres réelles —
 *   BarreJournal et BarreAssistant n'en ont pas, et ne doivent pas apprendre
 *   à en avoir un pour cette seule fenêtre.
 * - Le mot qui se solidifie en pastille (« tâche », « journal », « question »
 *   tapé en tête d'un champ vide) n'est PAS encore fait : il demanderait
 *   d'exposer le texte brut de `BarreTache` à ce composant, qui ne le fait
 *   pas aujourd'hui (son texte vit dans `useTaskMode`). Les pastilles
 *   suffisent déjà à rendre le choix possible (même raisonnement que
 *   l'étape 5 du roadmap).
 * - Envoyer une question ici ne montre pas encore la bulle de réflexion — ça,
 *   c'est la troisième sous-étape. Pour l'instant elle cache la fenêtre
 *   rapide et montre la fenêtre principale (sans forcer la navigation vers
 *   /assistant : aucun canal n'existe aujourd'hui pour le lui dire).
 *
 * `mountKey` s'incrémente à CHAQUE vraie réouverture (pas un simple regain de
 * focus) : remonter la barre active vide son champ, et repartir sur le mode
 * Tâche + pastilles visibles à chaque fois est le choix délibéré pour la
 * question 02 du roadmap (« la fenêtre garde-t-elle sa dernière barre ? ») —
 * revenir au neutre est prévisible, cohérent avec « rien n'est choisi par
 * défaut » de l'artifact.
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

  const [mode, setMode] = useState<QuickMode>("tache");
  const [mountKey, setMountKey] = useState(0);
  const wasHidden = useRef(true);

  const hide = useCallback(() => {
    wasHidden.current = true;
    invoke("hide_quick_window").catch(() => {});
  }, []);

  const switchMode = useCallback((next: QuickMode) => {
    setMode((current) => (current === next ? current : next));
  }, []);

  // Focus + reset à l'affichage ; fermeture au blur.
  useEffect(() => {
    const win = getCurrentWindow();
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (blurTimer) clearTimeout(blurTimer);
        if (wasHidden.current) {
          wasHidden.current = false;
          setMode("tache");
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
  // que ça fait, pas encore ce que ça devrait faire.
  const handleAskInterim = useCallback(async () => {
    hide();
    invoke("show_main_window").catch(() => {});
  }, [hide]);

  // --- Morphing de hauteur : on mesure le contenu qui vient de se poser, et
  // on anime le CADRE vers cette valeur — jamais de `layout` de motion sur ce
  // cadre (il applique un scale qui écrase le contenu pendant la transition,
  // piège déjà documenté lors de la refonte Omnibar du 2026-08-24). Courbe
  // `--sortie` de l'artifact (cubic-bezier(0.16,1,0.3,1)), pas les presets de
  // lib/motion.ts : c'est le ressenti approuvé par l'utilisateur sur la
  // maquette, pas le vocabulaire général de l'app.
  const measureRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setHeight(el.getBoundingClientRect().height);
  }, [mode, mountKey]);

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
              {mode === "tache" && (
                <BarreTache
                  key={`tache-${mountKey}`}
                  autoFocus
                  onSubmit={handleSubmit}
                  placeholder="Capturer une tâche…"
                  lists={lists}
                />
              )}
              {mode === "journal" && <BarreJournal key={`journal-${mountKey}`} autoFocus />}
              {mode === "question" && (
                <BarreAssistant
                  key={`question-${mountKey}`}
                  autoFocus
                  onSubmit={handleAskInterim}
                  placeholder="Demander, créer, chercher…"
                />
              )}
            </div>
          </motion.div>

          <QuickPills mode={mode} onChoose={switchMode} entryKey={mountKey} />
        </div>
      </div>
    </div>
  );
}
