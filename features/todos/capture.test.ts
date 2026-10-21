import { describe, it, expect } from "vitest";
import { payloadDeCapture } from "./capture";
import type { SmartTaskData } from "./useTaskMode";

function saisie(partial: Partial<SmartTaskData> = {}): SmartTaskData {
  return { text: "Sortir les poubelles", ...partial };
}

describe("payloadDeCapture", () => {
  it("garde la récurrence hebdomadaire et ses jours nommés", () => {
    const p = payloadDeCapture(
      saisie({ recurrence: "weekly", recurWeekdays: "mon" }),
      null,
    );
    expect(p.recurrence).toBe("weekly");
    expect(p.recur_weekdays).toBe("mon");
  });

  it("n'écrit pas recur_weekdays quand aucun jour n'est nommé", () => {
    const p = payloadDeCapture(saisie({ recurrence: "weekly" }), null);
    expect(p.recurrence).toBe("weekly");
    expect("recur_weekdays" in p).toBe(false);
  });

  it("n'écrit pas de récurrence pour « none »", () => {
    const p = payloadDeCapture(saisie({ recurrence: "none" }), null);
    expect("recurrence" in p).toBe(false);
  });

  it("applique le défaut de date quand aucune date n'est reconnue", () => {
    const p = payloadDeCapture(saisie(), null, {
      whenUndated: { scheduled_for: "2026-10-21" },
    });
    expect(p.scheduled_for).toBe("2026-10-21");
  });

  it("écarte le défaut de date quand une date est saisie", () => {
    const p = payloadDeCapture(saisie({ dueDate: new Date(2026, 9, 25) }), null, {
      whenUndated: { scheduled_for: "2026-10-21" },
    });
    expect(p.scheduled_for).toBe("2026-10-25");
  });

  it("un #projet tapé prime sur le conteneur et vide le domaine", () => {
    const p = payloadDeCapture(saisie(), "p1", {
      container: { area_id: "a1" },
    });
    expect(p.project_id).toBe("p1");
    expect(p.area_id).toBeNull();
  });

  it("ne pose jamais d'échéance (due_date reste null)", () => {
    const p = payloadDeCapture(saisie({ dueDate: new Date(2026, 9, 25) }), null);
    expect(p.due_date).toBeNull();
  });
});
