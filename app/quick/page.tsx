"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Omnibar from "@/components/Omnibar";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

/**
 * Barre de capture rapide (style Spotlight) : la fenêtre `quick` est une barre
 * flottante transparente. On l'ouvre via le raccourci global (Alt+Q) ou le
 * tray. Elle se ferme après validation, sur Échap, ou quand elle perd le
 * focus (clic ailleurs / changement d'application).
 *
 * La fenêtre a une taille FIXE (voir `src-tauri/tauri.conf.json`, label
 * `quick`) plutôt que de suivre son contenu : animer un `setSize` OS image
 * par image jusqu'à une forme aussi étroite qu'une bulle de réflexion (étape
 * Question à venir, docs/ROADMAP-BARRES.md étape 4) referait sauter la
 * fenêtre — exactement ce que l'ancien code évitait déjà pendant l'ouverture
 * d'un popover en ne recentrant pas. La coque est donc posée une fois pour
 * toutes, assez haute pour que calendrier/priorité aient leur place SOUS la
 * barre (ancrée en haut, `items-start`) sans jamais avoir besoin de grandir.
 *
 * Le `mountKey` est incrémenté à chaque fois que la fenêtre (re)prend le
 * focus : remonter l'Omnibar vide le champ et redéclenche l'autofocus.
 */
/** Un overlay Radix (calendrier / menu de priorité) est-il ouvert ? */
function isOverlayOpen() {
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}

export default function QuickPage() {
  useTodosSync();
  const { createTodo } = useTodoMutations();
  const { appendEntry: appendJournalEntry } = useJournalMutations();
  const { projects, createProject } = useProjects();
  const { resolveTagNames, setTodoTags } = useTags();
  // Noms des projets actifs pour l'autocomplétion `#` — vient de la table
  // `projects`, plus d'un scan des chaînes `todos.list` (colonne héritée).
  const lists = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "fr")),
    [projects],
  );
  const [mountKey, setMountKey] = useState(0);
  // La barre démarre cachée : on ne réinitialise le champ qu'à une vraie
  // réouverture, pas à chaque regain de focus (ex. fermeture d'un menu).
  const wasHidden = useRef(true);

  const hide = useCallback(() => {
    wasHidden.current = true;
    invoke("hide_quick_window").catch(() => {});
  }, []);

  // Focus + reset à l'affichage ; fermeture au blur.
  useEffect(() => {
    const win = getCurrentWindow();
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (blurTimer) clearTimeout(blurTimer);
        // Vraie réouverture (barre précédemment cachée) → champ neuf + autofocus.
        // Un simple regain de focus (fermeture d'un menu) ne réinitialise rien.
        if (wasHidden.current) {
          wasHidden.current = false;
          setMountKey((k) => k + 1);
        }
        return;
      }

      // Blur : on diffère la décision. L'ouverture d'un <Select> Radix remanie le
      // focus (vers son portail) et peut émettre un « blur » transitoire AVANT que
      // le menu ne soit dans le DOM. On ne ferme que si la fenêtre a réellement
      // perdu le focus OS (document.hasFocus()) et qu'aucun overlay n'est ouvert.
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

      // Le `#nom` désigne un projet (plus une liste en texte libre) : on résout
      // vers un projet existant, insensible à la casse — même politique que la
      // réconciliation Rust et que la capture du planner.
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
        // La date saisie est une planification ; l'échéance ne se pose que
        // dans le panneau de détail.
        scheduled_for: due ?? todayLocalISODate(),
        due_date: null,
        project_id: projectId,
      });

      // Les `@tag` se posent après la création (set_todo_tags reste le seul
      // écrivain de task_tags) — sinon ils seraient perdus depuis Alt+Q.
      if (data.tags?.length) {
        const ids = await resolveTagNames(data.tags);
        if (ids.length) await setTodoTags(todo.id, ids);
      }

      hide();
    },
    [createTodo, createProject, projects, resolveTagNames, setTodoTags, hide],
  );

  // `/note` écrit dans le Journal d'AUJOURD'HUI — pas de sélecteur de date
  // depuis la capture rapide (Phase P) : celui-là n'existe que dans l'éditeur
  // complet du Journal (navigation par jour).
  //
  // On PROLONGE la reprise en cours plutôt que d'ouvrir un bloc : jeter une
  // ligne ici pendant qu'on écrit dans la page, c'est le même moment. Rust
  // arbitre, seul à voir les deux fenêtres.
  const handleSubmitNote = useCallback(
    async (text: string) => {
      await appendJournalEntry(todayLocalISODate(), text);
      hide();
    },
    [appendJournalEntry, hide],
  );

  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent">
      <div className="max-h-screen w-full overflow-y-auto p-7">
        {/* Ombre portée profonde : la fenêtre est transparente et sans ombre
            native, c'est elle qui donne l'effet « flotte au-dessus du bureau ».
            `.shadow-floating` = même recette (teintée oklch) que `.card-floating`,
            avec sa variante sombre — pas de rgba noir en dur. */}
        <div className="rounded-2xl shadow-floating">
          <Omnibar
            key={mountKey}
            autoFocus
            defaultMode="task"
            onSubmit={handleSubmit}
            onSubmitNote={handleSubmitNote}
            placeholder="Capturer une tâche…"
            lists={lists}
          />
        </div>
      </div>
    </div>
  );
}
