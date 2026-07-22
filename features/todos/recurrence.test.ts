import { describe, it, expect } from "vitest";
import {
  nextOccurrence,
  recurrenceLabel,
  type RecurrenceFields,
} from "./recurrence";
import type { Recurrence } from "./types";

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
