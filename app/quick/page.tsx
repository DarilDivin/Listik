"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import Omnibar from "@/components/Omnibar";
import { todosApi } from "@/features/todos/api";
import { useTodosSync } from "@/features/todos/useTodosSync";
import { useTodoMutations } from "@/features/todos/useTodoMutations";
import { useNotesMutations } from "@/features/notes/useNotesMutations";
import { SWR_KEYS } from "@/lib/swr-config";
import { todayLocalISODate, toLocalISODate } from "@/lib/date";
import type { SmartTaskData } from "@/features/todos/useTaskMode";

const WINDOW_WIDTH = 680;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 600; // texte seul : au-delà, la zone scrolle en interne
const POPOVER_GAP = 24; // marge sous l'input pour le popover ouvert

/**
 * Barre de capture rapide (style Spotlight) : la fenêtre `quick` est une barre
 * flottante transparente qui n'affiche que le SmartTaskInput. On l'ouvre via le
 * raccourci global (Alt+Q) ou le tray. Elle se ferme après validation, sur Échap,
 * ou quand elle perd le focus (clic ailleurs / changement d'application).
 *
 * Le `mountKey` est incrémenté à chaque fois que la fenêtre (re)prend le focus :
 * remonter le SmartTaskInput vide le champ et redéclenche l'autofocus.
 *
 * La hauteur de la fenêtre suit le contenu (croissance/réduction fluide), plafonnée
 * à MAX_HEIGHT au-delà de laquelle la zone scrolle ; on recentre après chaque ajustement.
 */
/** Un overlay Radix (calendrier / menu de priorité) est-il ouvert ? */
function isOverlayOpen() {
  return !!document.querySelector("[data-radix-popper-content-wrapper]");
}

export default function QuickPage() {
  useTodosSync();
  const { createTodo } = useTodoMutations();
  const { createNote } = useNotesMutations();
  const { data: allTodos = [] } = useSWR(SWR_KEYS.ALL_TODOS, () => todosApi.list());
  const lists = useMemo(
    () =>
      Array.from(
        new Set(allTodos.flatMap((t) => (t.list ? [t.list] : []))),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [allTodos],
  );
  const [mountKey, setMountKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // La barre démarre cachée : on ne réinitialise le champ qu'à une vraie
  // réouverture, pas à chaque regain de focus (ex. fermeture d'un menu).
  const wasHidden = useRef(true);

  const hide = useCallback(() => {
    wasHidden.current = true;
    invoke("hide_quick_window").catch(() => {});
  }, []);

  // Ajuste la hauteur de la fenêtre au contenu — et l'agrandit vers le bas quand
  // un popover (calendrier / priorité) est ouvert, sinon il serait coupé par les
  // bords de la fenêtre. L'input est ancré en haut (items-start) pour laisser la
  // place au popover en dessous.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const win = getCurrentWindow();
    let raf = 0;
    let lastH = 0;

    const apply = () => {
      // el inclut déjà son propre rembourrage (place pour le halo lumineux).
      const inputH = Math.ceil(el.scrollHeight);

      // Popover Radix ouvert (rendu dans un portail au niveau du body) ?
      const popper = document.querySelector<HTMLElement>(
        "[data-radix-popper-content-wrapper]",
      );
      const popperH = popper ? Math.ceil(popper.offsetHeight) : 0;

      let target: number;
      if (popperH > 0) {
        const cap = Math.min(720, (window.screen?.availHeight ?? 900) - 80);
        target = Math.min(inputH + popperH + POPOVER_GAP, cap);
      } else {
        target = Math.min(Math.max(inputH, MIN_HEIGHT), MAX_HEIGHT);
      }

      if (target === lastH) return;
      lastH = target;

      const resized = win.setSize(new LogicalSize(WINDOW_WIDTH, target));
      // On ne recentre que sans popover : recentrer pendant l'ouverture ferait
      // « sauter » l'input et le popover. Sinon, croissance vers le bas (coin fixe).
      if (popperH === 0) resized.then(() => win.center()).catch(() => {});
      else resized.catch(() => {});
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    // Détecte l'ouverture/fermeture des poppers (apparition/retrait dans le DOM).
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [mountKey]);

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
      await createTodo({
        text: data.text,
        note: data.note ?? null,
        list: data.list ?? null,
        priority: data.priority ?? "normal",
        scheduled_for: due ?? todayLocalISODate(),
        due_date: due,
      });
      hide();
    },
    [createTodo, hide],
  );

  const handleSubmitNote = useCallback(
    async (text: string) => {
      await createNote({ content: text });
      hide();
    },
    [createNote, hide],
  );

  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent">
      <div
        ref={contentRef}
        className="max-h-screen w-full overflow-y-auto p-7"
      >
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
  );
}
