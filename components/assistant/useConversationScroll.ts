"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Marge sous laquelle on considère que l'utilisateur suit le bas du fil. */
const BOTTOM_THRESHOLD = 48;

/**
 * Défilement du fil, réduit à ce que le template shadcn/chatbot apporte
 * vraiment ici. Son `MessageScroller` vient du paquet `@shadcn/react` (bâti
 * sur Base UI, incompatible avec nos composants Radix) et l'essentiel de sa
 * machinerie sert le streaming — que `ai_agent_run` n'a pas : la réponse
 * arrive d'un bloc. Restent deux comportements, ceux qui se voient :
 *
 * 1. **Ancrage** : à l'envoi, la nouvelle question monte EN HAUT du cadre
 *    (`block: "start"`), pas le bas du fil qu'on pousse — la réponse se
 *    déroule ensuite sous les yeux, à la place où on l'attend. Le dernier
 *    tour reçoit pour cela une hauteur minimale d'un écran (`viewportHeight`).
 * 2. **Retour au bas** : dès qu'on remonte dans l'historique, un bouton
 *    ramène au dernier échange.
 */
export function useConversationScroll() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const read = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD);
    };
    // La hauteur du cadre change avec la fenêtre ET avec la barre de saisie
    // (qui grandit en multi-ligne) : on la relit plutôt que de la mesurer une
    // fois au montage.
    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
      read();
    });
    observer.observe(el);
    el.addEventListener("scroll", read, { passive: true });
    setViewportHeight(el.clientHeight);
    read();

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", read);
    };
  }, []);

  // `scroll-behavior: auto !important` (globals.css) ne couvre pas un
  // `behavior: "smooth"` passé explicitement : on teste nous-mêmes.
  const behavior = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  /** Amène le dernier tour en haut du cadre (à appeler après l'envoi). */
  const anchorLatest = useCallback(() => {
    requestAnimationFrame(() => {
      anchorRef.current?.scrollIntoView({ block: "start", behavior: behavior() });
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = viewportRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: behavior() });
  }, []);

  return { viewportRef, anchorRef, atBottom, viewportHeight, anchorLatest, scrollToBottom };
}
