import { describe, it, expect } from "vitest";
import {
  nextOccurrence,
  recurrenceLabel,
  projectFutureOccurrences,
  buildGhostOccurrences,
  type RecurrenceFields,
} from "./recurrence";
import type { Recurrence, Todo } from "./types";

// ⚠️ Table de parité avec src-tauri/src/models/task.rs (tests `rule_advance_*`) :
// les mêmes cas doivent passer des deux côtés — le miroir JS pilote l'optimiste,
// un écart = une date qui « flicke » quand le backend corrige.

function fields(
  partial: Partial<RecurrenceFields> & { recurrence: Recurrence },
): RecurrenceFields {
  return {
    recur_interval: 1,
    recur_weekday: null,
    recur_setpos: null,
    recur_mode: "fixed",
    ...partial,
  };
}

describe("nextOccurrence — comportements historiques (intervalle 1)", () => {
  // 2026-06-14 est un dimanche.
  it("daily : +1 jour", () => {
    expect(nextOccurrence("2026-06-14", fields({ recurrence: "daily" }))).toBe("2026-06-15");
  });

  it("weekly : +7 jours", () => {
    expect(nextOccurrence("2026-06-14", fields({ recurrence: "weekly" }))).toBe("2026-06-21");
  });

  it("monthly : +1 mois", () => {
    expect(nextOccurrence("2026-06-14", fields({ recurrence: "monthly" }))).toBe("2026-07-14");
  });

  it("weekdays : vendredi → lundi", () => {
    expect(nextOccurrence("2026-06-12", fields({ recurrence: "weekdays" }))).toBe("2026-06-15");
  });

  it("none : inchangé", () => {
    expect(nextOccurrence("2026-06-14", fields({ recurrence: "none" }))).toBe("2026-06-14");
  });
});

describe("nextOccurrence — toutes les N", () => {
  it("toutes les 2 semaines", () => {
    expect(
      nextOccurrence("2026-06-14", fields({ recurrence: "weekly", recur_interval: 2 })),
    ).toBe("2026-06-28");
  });

  it("tous les 3 jours", () => {
    expect(
      nextOccurrence("2026-06-14", fields({ recurrence: "daily", recur_interval: 3 })),
    ).toBe("2026-06-17");
  });

  it("tous les 2 mois", () => {
    expect(
      nextOccurrence("2026-06-14", fields({ recurrence: "monthly", recur_interval: 2 })),
    ).toBe("2026-08-14");
  });

  it("fin de mois bornée comme chrono (31 janv + 1 mois = 28 févr, PAS 3 mars)", () => {
    // Le piège JS classique : setMonth(+1) déborde. Le miroir doit borner,
    // sinon l'optimiste affiche une date que le backend corrige (flicker).
    expect(nextOccurrence("2026-01-31", fields({ recurrence: "monthly" }))).toBe("2026-02-28");
  });

  it("weekdays ignore l'intervalle (« un ouvré sur deux » ne veut rien dire)", () => {
    expect(
      nextOccurrence("2026-06-12", fields({ recurrence: "weekdays", recur_interval: 5 })),
    ).toBe("2026-06-15");
  });
});

describe("nextOccurrence — positionnel mensuel (strict-après)", () => {
  const firstMonday = fields({
    recurrence: "monthly",
    recur_weekday: "mon",
    recur_setpos: 1,
  });

  it("cochée LE 1er lundi → saute au 1er lundi du mois suivant (jamais elle-même)", () => {
    expect(nextOccurrence("2026-06-01", firstMonday)).toBe("2026-07-06");
  });

  it("base désalignée avant l'occurrence du mois → la rattrape", () => {
    expect(nextOccurrence("2026-07-02", firstMonday)).toBe("2026-07-06");
  });

  it("base après l'occurrence du mois → mois suivant", () => {
    expect(nextOccurrence("2026-07-10", firstMonday)).toBe("2026-08-03");
  });

  it("« dernier vendredi » ≠ « 4e vendredi » (juillet 2026 en a 5)", () => {
    expect(
      nextOccurrence(
        "2026-06-26",
        fields({ recurrence: "monthly", recur_weekday: "fri", recur_setpos: -1 }),
      ),
    ).toBe("2026-07-31");
  });

  it("« dernier jour du mois » ne dérive jamais (bissextile inclus)", () => {
    const lastDay = fields({ recurrence: "monthly", recur_setpos: -1 });
    expect(nextOccurrence("2026-01-31", lastDay)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", lastDay)).toBe("2026-03-31");
    expect(nextOccurrence("2028-01-31", lastDay)).toBe("2028-02-29");
  });
});

describe("recurrenceLabel", () => {
  it("libellés simples et intervalles", () => {
    expect(recurrenceLabel(fields({ recurrence: "daily" }))).toBe("Tous les jours");
    expect(recurrenceLabel(fields({ recurrence: "weekly", recur_interval: 2 }))).toBe(
      "Toutes les 2 semaines",
    );
    expect(recurrenceLabel(fields({ recurrence: "daily", recur_interval: 3 }))).toBe(
      "Tous les 3 jours",
    );
    expect(recurrenceLabel(fields({ recurrence: "monthly", recur_interval: 2 }))).toBe(
      "Tous les 2 mois",
    );
  });

  it("positionnel mensuel", () => {
    expect(
      recurrenceLabel(fields({ recurrence: "monthly", recur_weekday: "mon", recur_setpos: 1 })),
    ).toBe("Le 1er lundi du mois");
    expect(
      recurrenceLabel(fields({ recurrence: "monthly", recur_weekday: "fri", recur_setpos: -1 })),
    ).toBe("Le dernier vendredi du mois");
    expect(recurrenceLabel(fields({ recurrence: "monthly", recur_setpos: -1 }))).toBe(
      "Le dernier jour du mois",
    );
  });

  it("après complétion", () => {
    expect(
      recurrenceLabel(
        fields({ recurrence: "weekly", recur_interval: 3, recur_mode: "after_completion" }),
      ),
    ).toBe("3 semaines après complétion");
    expect(
      recurrenceLabel(
        fields({ recurrence: "daily", recur_interval: 1, recur_mode: "after_completion" }),
      ),
    ).toBe("1 jour après complétion");
  });
});

describe("projectFutureOccurrences", () => {
  it("daily : projette les N prochaines occurrences, jamais la seed elle-même", () => {
    expect(
      projectFutureOccurrences("2026-06-14", fields({ recurrence: "daily" }), { maxCount: 3 }),
    ).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
  });

  it("respecte le cap maxCount", () => {
    expect(
      projectFutureOccurrences("2026-06-14", fields({ recurrence: "daily" }), { maxCount: 2 }),
    ).toHaveLength(2);
  });

  it("s'arrête à horizonDays même si maxCount permettrait plus", () => {
    // +1 mois depuis le 14 juin (30 jours) tient dans un horizon de 40 jours ;
    // +2 mois (61 jours) dépasse — la boucle s'arrête avant.
    expect(
      projectFutureOccurrences("2026-06-14", fields({ recurrence: "monthly" }), {
        maxCount: 10,
        horizonDays: 40,
      }),
    ).toEqual(["2026-07-14"]);
  });

  it("after_completion : aucune projection (date de base inconnue avant complétion réelle)", () => {
    expect(
      projectFutureOccurrences(
        "2026-06-14",
        fields({ recurrence: "weekly", recur_mode: "after_completion" }),
      ),
    ).toEqual([]);
  });

  it("none : aucune projection", () => {
    expect(projectFutureOccurrences("2026-06-14", fields({ recurrence: "none" }))).toEqual([]);
  });
});

describe("buildGhostOccurrences", () => {
  function isoDaysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }

  function todo(partial: Partial<Todo> & { recurrence: Recurrence }): Todo {
    return {
      id: "t1",
      text: "Tâche test",
      note: null,
      list: null,
      status: "pending",
      priority: "normal",
      recur_interval: 1,
      recur_weekday: null,
      recur_setpos: null,
      recur_mode: "fixed",
      scheduled_for: null,
      due_date: null,
      remind_at: null,
      project_id: null,
      area_id: null,
      heading_id: null,
      this_evening: false,
      someday: false,
      created_at: "2026-01-01T00:00:00",
      updated_at: "2026-01-01T00:00:00",
      sub_tasks: [],
      tags: [],
      ...partial,
    };
  }

  it("projette une tâche récurrente dont la ligne réelle est AUJOURD'HUI (piège du seed scopé à Upcoming)", () => {
    const ghosts = buildGhostOccurrences([
      todo({ id: "sport", text: "Sport", recurrence: "weekly", scheduled_for: isoDaysFromNow(0) }),
    ]);
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts[0]).toMatchObject({ text: "Sport", date: isoDaysFromNow(7) });
    expect(ghosts[0].key).toBe(`ghost-sport-${isoDaysFromNow(7)}`);
  });

  it("exclut le mode après-complétion", () => {
    expect(
      buildGhostOccurrences([
        todo({
          recurrence: "daily",
          recur_mode: "after_completion",
          scheduled_for: isoDaysFromNow(0),
        }),
      ]),
    ).toEqual([]);
  });

  it("exclut les tâches « un jour » (someday)", () => {
    expect(
      buildGhostOccurrences([
        todo({ recurrence: "daily", someday: true, scheduled_for: isoDaysFromNow(0) }),
      ]),
    ).toEqual([]);
  });

  it("exclut les tâches non planifiées (scheduled_for null)", () => {
    expect(
      buildGhostOccurrences([todo({ recurrence: "daily", scheduled_for: null })]),
    ).toEqual([]);
  });

  it("exclut les tâches terminées ou annulées", () => {
    expect(
      buildGhostOccurrences([
        todo({ recurrence: "daily", status: "completed", scheduled_for: isoDaysFromNow(0) }),
      ]),
    ).toEqual([]);
  });

  it("fenêtre d'affichage par défaut : bornée par maxCount, pas par un cutoff de jours arbitraire", () => {
    const ghosts = buildGhostOccurrences([
      todo({ id: "daily", recurrence: "daily", scheduled_for: isoDaysFromNow(0) }),
    ]);
    expect(ghosts.map((g) => g.date)).toEqual(
      Array.from({ length: 10 }, (_, i) => isoDaysFromNow(i + 1)),
    );
  });

  it("une récurrence hebdomadaire voyage au-delà d'une semaine (J+7, J+14…) — pas seulement la semaine courante", () => {
    // Acceptance test de la roadmap (phase M) : les occurrences doivent
    // apparaître « aux bons jours à venir », y compris dans les compartiments
    // semaine/mois du style zoom, pas seulement dans les 7 premiers jours.
    const ghosts = buildGhostOccurrences([
      todo({ id: "sport", recurrence: "weekly", scheduled_for: isoDaysFromNow(0) }),
    ]);
    expect(ghosts.map((g) => g.date)).toEqual([
      isoDaysFromNow(7),
      isoDaysFromNow(14),
      isoDaysFromNow(21),
      isoDaysFromNow(28),
      isoDaysFromNow(35),
      isoDaysFromNow(42),
      isoDaysFromNow(49),
      isoDaysFromNow(56),
      isoDaysFromNow(63),
      isoDaysFromNow(70),
    ]);
  });

  it("maxDay reste un levier explicite pour un appelant qui veut restreindre l'affichage", () => {
    const ghosts = buildGhostOccurrences(
      [todo({ recurrence: "daily", scheduled_for: isoDaysFromNow(0) })],
      { maxDay: 3 },
    );
    expect(ghosts.map((g) => g.date)).toEqual([
      isoDaysFromNow(1),
      isoDaysFromNow(2),
      isoDaysFromNow(3),
    ]);
  });

  it("trie les fantômes de plusieurs tâches par date croissante", () => {
    const ghosts = buildGhostOccurrences([
      todo({ id: "a", recurrence: "weekly", scheduled_for: isoDaysFromNow(-2) }),
      todo({ id: "b", recurrence: "daily", scheduled_for: isoDaysFromNow(0) }),
    ]);
    const dates = ghosts.map((g) => g.date);
    expect(dates).toEqual([...dates].sort());
  });
});
