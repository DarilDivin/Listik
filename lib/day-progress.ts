"use client";

import { useEffect, useState } from "react";

/**
 * Bornes de la journée « utile ». Pas minuit-minuit : à 8 h du matin, un tiers
 * du jour civil est écoulé alors que la journée commence à peine — le repère
 * dirait déjà « tu es en retard », ce qui serait faux et décourageant. On se
 * cale sur les heures où l'on travaille et où l'app parle (la section « Ce
 * soir » va tard, d'où 23 h).
 */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;

/** Rafraîchi à la minute : ce repère se déplace lentement, il n'a aucune
 *  raison de repeindre plus souvent (et surtout pas comme une trotteuse). */
const TICK_MS = 60_000;

/**
 * Fraction de la journée utile déjà écoulée, entre 0 et 1 — ou `null` en
 * dehors de ces heures.
 *
 * Le `null` n'est pas une précaution : sur un cadran, 100 % et 0 % sont le
 * MÊME point. Un repère laissé à minuit dirait donc « la journée commence »
 * alors qu'elle est finie. Avant 7 h comme après 23 h, il n'y a rien à situer.
 */
export function dayElapsedFraction(now: Date): number | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = DAY_START_HOUR * 60;
  const end = DAY_END_HOUR * 60;
  if (minutes < start || minutes > end) return null;
  return (minutes - start) / (end - start);
}

/**
 * Ce qu'il reste de la journée utile, en trois états distincts plutôt qu'un
 * nombre et un `null` à interpréter côté appelant.
 *
 * `null` disait « rien à situer » sans dire de quel côté : avant 7 h et après
 * 23 h ne se racontent pas de la même façon. Une légende doit choisir ses
 * mots, elle a donc besoin de les distinguer.
 */
export type DayRemainder =
  | { kind: "before" }
  | { kind: "after" }
  | { kind: "left"; minutes: number };

export function dayRemainder(now: Date): DayRemainder {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = DAY_START_HOUR * 60;
  const end = DAY_END_HOUR * 60;
  if (minutes < start) return { kind: "before" };
  if (minutes > end) return { kind: "after" };
  return { kind: "left", minutes: end - minutes };
}

/**
 * Part de la journée écoulée, tenue à jour.
 *
 * Rendue à `null` au premier rendu, puis calculée après le montage :
 * l'application est exportée en statique, une valeur calculée pendant le rendu
 * serait figée à l'heure de la construction. Les appelants n'affichent le
 * repère qu'une fois la valeur connue.
 */
export function useDayProgress(): number | null {
  const [fraction, setFraction] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setFraction(dayElapsedFraction(new Date()));
    update();
    const id = setInterval(update, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return fraction;
}

/**
 * Reste de la journée, tenu à jour. Même précaution que `useDayProgress` :
 * calculé après le montage, jamais pendant le rendu — l'app est exportée en
 * statique, la valeur serait figée à l'heure de la construction.
 */
export function useDayRemainder(): DayRemainder | null {
  const [remainder, setRemainder] = useState<DayRemainder | null>(null);

  useEffect(() => {
    const update = () => setRemainder(dayRemainder(new Date()));
    update();
    const id = setInterval(update, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return remainder;
}
