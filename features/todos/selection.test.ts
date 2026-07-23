import { describe, it, expect } from "vitest";
import { rangeIds, selectionOnClick, toggleId } from "./selection";

const IDS = ["a", "b", "c", "d", "e"];
const noMods = { shift: false, meta: false };

describe("toggleId", () => {
  it("ajoute puis retire", () => {
    expect([...toggleId(new Set(), "a")]).toEqual(["a"]);
    expect([...toggleId(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
});

describe("rangeIds", () => {
  it("plage inclusive, dans les deux sens", () => {
    expect(rangeIds(IDS, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(IDS, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeIds(IDS, "c", "c")).toEqual(["c"]);
  });

  it("id absent (liste re-rendue) → au moins la cible", () => {
    expect(rangeIds(IDS, "zz", "c")).toEqual(["c"]);
  });
});

describe("selectionOnClick", () => {
  it("clic simple : ne consomme pas (ouvre le détail), pose l'ancre", () => {
    const r = selectionOnClick(new Set(), null, IDS, "c", noMods);
    expect(r.consumed).toBe(false);
    expect(r.anchor).toBe("c");
    expect(r.selected.size).toBe(0);
  });

  it("clic simple avec sélection en cours : la vide, ne consomme toujours pas", () => {
    const r = selectionOnClick(new Set(["a", "b"]), "a", IDS, "d", noMods);
    expect(r.consumed).toBe(false);
    expect(r.selected.size).toBe(0);
  });

  it("Ctrl/Cmd : bascule et consomme, l'id devient l'ancre", () => {
    const r = selectionOnClick(new Set(["a"]), "a", IDS, "c", { shift: false, meta: true });
    expect(r.consumed).toBe(true);
    expect([...r.selected].sort()).toEqual(["a", "c"]);
    expect(r.anchor).toBe("c");

    // Re-Ctrl+clic retire.
    const r2 = selectionOnClick(r.selected, r.anchor, IDS, "a", { shift: false, meta: true });
    expect([...r2.selected]).toEqual(["c"]);
  });

  it("Maj : plage ancre→cible, remplace la sélection", () => {
    const r = selectionOnClick(new Set(["a"]), "a", IDS, "d", { shift: true, meta: false });
    expect(r.consumed).toBe(true);
    expect([...r.selected]).toEqual(["a", "b", "c", "d"]);
    // L'ancre reste « a » : un second Maj+clic re-part de là.
    const r2 = selectionOnClick(r.selected, r.anchor, IDS, "b", { shift: true, meta: false });
    expect([...r2.selected]).toEqual(["a", "b"]);
  });

  it("Maj sans ancre : retombe sur un clic simple", () => {
    const r = selectionOnClick(new Set(), null, IDS, "c", { shift: true, meta: false });
    expect(r.consumed).toBe(false);
  });
});
