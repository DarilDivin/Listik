import { describe, it, expect } from "vitest";
import {
  detectListFromText,
  expandDateMatchLeft,
  parseTaskDate,
  stripDateFromText,
  detectPriorityFromText,
  detectPriorityMatchFromText,
  detectRecurrenceMatchFromText,
  stripRecurrenceFromText,
  detectTagsFromText,
  formatDateToNaturalText,
  splitNote,
  stripListFromText,
  stripTagsFromText,
} from "./smartParse";

describe("detectPriorityFromText", () => {
  it("détecte high sur les mots-clés", () => {
    expect(detectPriorityFromText("réunion urgente")).toBe("high");
    expect(detectPriorityFromText("c'est important")).toBe("high");
    expect(detectPriorityFromText("fais ça !")).toBe("high");
  });

  it("détecte low", () => {
    expect(detectPriorityFromText("ranger le garage plus tard")).toBe("low");
  });

  it("couvre le mot ACCORDÉ, pas seulement sa racine", () => {
    // « important » seul laissait le « e » dehors : le remplacer donnait
    // « très plus tarde ».
    const m = detectPriorityMatchFromText("Cette tâche est très importante");
    expect(m?.match.text).toBe("importante");
    expect(detectPriorityMatchFromText("des choses urgentes")?.match.text).toBe(
      "urgentes",
    );
  });

  it("ne confond pas un mot qui commence pareil", () => {
    expect(detectPriorityMatchFromText("appeler l'importateur")).toBeNull();
    expect(detectPriorityFromText("appeler l'importateur")).toBe("normal");
  });

  it("retombe sur normal par défaut", () => {
    expect(detectPriorityFromText("acheter du pain")).toBe("normal");
  });
});

describe("splitNote", () => {
  it("ne renvoie que le texte sans //", () => {
    expect(splitNote("acheter du pain")).toEqual({
      mainText: "acheter du pain",
      note: undefined,
    });
  });

  it("sépare le texte de la note", () => {
    expect(splitNote("acheter du pain // bio de préférence")).toEqual({
      mainText: "acheter du pain",
      note: "bio de préférence",
    });
  });

  it("conserve les // à l'intérieur de la note", () => {
    expect(splitNote("a // b // c")).toEqual({ mainText: "a", note: "b // c" });
  });
});

describe("detectTagsFromText", () => {
  it("détecte plusieurs tags @nom", () => {
    expect(detectTagsFromText("appeler le plombier @urgent @maison")).toEqual([
      "urgent",
      "maison",
    ]);
  });

  it("N'INVENTE PAS de tag depuis une adresse e-mail", () => {
    // Le piège : sans `(?:^|\s)` avant le @, « example » deviendrait un tag.
    expect(detectTagsFromText("envoyer un mail à jean@example.com")).toEqual([]);
  });

  it("dédoublonne, insensible à la casse (garde la 1re graphie)", () => {
    expect(detectTagsFromText("a @Urgent b @urgent")).toEqual(["Urgent"]);
  });

  it("ignore un @ situé dans la note (après //)", () => {
    expect(detectTagsFromText("acheter // demander @jean")).toEqual([]);
  });

  it("renvoie une liste vide sans tag", () => {
    expect(detectTagsFromText("acheter du lait")).toEqual([]);
  });

  it("cohabite avec le projet #nom", () => {
    const text = "acheter du lait #courses @urgent";
    expect(detectListFromText(text)?.list).toBe("courses");
    expect(detectTagsFromText(text)).toEqual(["urgent"]);
  });
});

describe("stripTagsFromText", () => {
  it("retire les tags et normalise les espaces", () => {
    expect(stripTagsFromText("appeler @urgent le plombier @maison")).toBe(
      "appeler le plombier",
    );
  });

  it("laisse intacte une adresse e-mail", () => {
    expect(stripTagsFromText("mail à jean@example.com")).toBe(
      "mail à jean@example.com",
    );
  });
});

describe("detectListFromText", () => {
  it("détecte un tag #liste", () => {
    expect(detectListFromText("acheter du lait #courses")).toEqual({
      list: "courses",
      match: { index: 16, text: "#courses" },
    });
  });

  it("renvoie null sans tag", () => {
    expect(detectListFromText("acheter du lait")).toBeNull();
  });

  it("ignore un # situé dans la note (après //)", () => {
    expect(detectListFromText("acheter // voir #promo")).toBeNull();
  });
});

describe("stripListFromText", () => {
  it("retire le tag et normalise les espaces", () => {
    expect(stripListFromText("acheter du lait #courses")).toBe("acheter du lait");
    expect(stripListFromText("#courses acheter du lait")).toBe("acheter du lait");
  });

  it("laisse le texte intact sans tag", () => {
    expect(stripListFromText("acheter du lait")).toBe("acheter du lait");
  });
});

describe("formatDateToNaturalText", () => {
  it("renvoie aujourd'hui pour la date du jour", () => {
    expect(formatDateToNaturalText(new Date())).toBe("aujourd'hui");
  });

  it("renvoie demain pour le lendemain", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDateToNaturalText(tomorrow)).toBe("demain");
  });
});


describe("stripDateFromText", () => {
  /** Passe par le vrai chrono : c'est sa capture (parfois avec la
   *  preposition, parfois sans) que l'extension doit rattraper. */
  const strip = (phrase: string) =>
    stripDateFromText(phrase, parseTaskDate(phrase)?.match ?? null);

  it("emporte le determinant que chrono laisse derriere", () => {
    expect(strip("Faire la vaisselle le 3 juin")).toBe("Faire la vaisselle");
    expect(strip("Reviser le CV pour vendredi")).toBe("Reviser le CV");
  });

  it("emporte deux mots de liaison quand il le faut", () => {
    expect(strip("Payer le loyer avant le 5 septembre")).toBe("Payer le loyer");
  });

  it("laisse les captures que chrono fait deja proprement", () => {
    expect(strip("Acheter du pain demain")).toBe("Acheter du pain");
    expect(strip("Dentiste dans 3 jours")).toBe("Dentiste");
    expect(strip("Rendez-vous a 14h")).toBe("Rendez-vous");
  });

  it("ne mange pas un mot qui appartient a la phrase", () => {
    // « le » porte « pain », pas « demain » : il doit rester.
    expect(strip("Acheter le pain demain")).toBe("Acheter le pain");
  });

  it("ne touche pas a une date au milieu de la phrase", () => {
    // La date y appartient au propos : l'extraire couperait la phrase.
    const phrase =
      "Aimer Floriane de tout mon coeur. Aujourd'hui et demain et tous les autres jours.";
    expect(strip(phrase)).toBe(phrase);
    expect(strip("Reunion demain a Paris")).toBe("Reunion demain a Paris");
  });

  it("tolere une ponctuation finale apres la date", () => {
    expect(strip("Faire la vaisselle demain.")).toBe("Faire la vaisselle.");
  });

  it("ne touche pas a une date qui exprime une repetition", () => {
    // « chaque lundi » n'est pas encore compris comme une recurrence : retirer
    // la date effacerait la seule trace de l'intention.
    expect(strip("Sortir les poubelles chaque lundi")).toBe(
      "Sortir les poubelles chaque lundi",
    );
    expect(strip("Reunion tous les mardis")).toBe("Reunion tous les mardis");
  });

  it("rend le texte tel quel sans date", () => {
    expect(stripDateFromText("Acheter du pain", null)).toBe("Acheter du pain");
  });
});

describe("expandDateMatchLeft", () => {
  it("n'etend pas au-dela de deux mots", () => {
    const texte = "Tache pour avant le 3 juin";
    const match = { index: texte.indexOf("3 juin"), text: "3 juin" };
    // « le » puis « avant » : on s'arrete la, « pour » reste dans le titre.
    expect(expandDateMatchLeft(texte, match).text).toBe("avant le 3 juin");
  });

  it("rend la capture intacte quand rien n'est a emporter", () => {
    const texte = "Acheter le pain demain";
    const match = { index: texte.indexOf("demain"), text: "demain" };
    expect(expandDateMatchLeft(texte, match)).toEqual(match);
  });
});

describe("detectRecurrenceMatchFromText", () => {
  const kind = (t: string) => detectRecurrenceMatchFromText(t)?.recurrence ?? null;
  const frag = (t: string) => detectRecurrenceMatchFromText(t)?.match.text ?? null;

  it("reconnaît les quatre rythmes", () => {
    expect(kind("Sortir les poubelles chaque lundi")).toBe("weekly");
    expect(kind("Faire le ménage tous les mardis")).toBe("weekly");
    expect(kind("Arroser les plantes chaque semaine")).toBe("weekly");
    expect(kind("Vider la boîte chaque jour")).toBe("daily");
    expect(kind("Relever les mails en semaine")).toBe("weekdays");
    expect(kind("Payer le loyer chaque mois")).toBe("monthly");
  });

  it("préfère les jours ouvrés au quotidien", () => {
    // « chaque jour ouvré » contient « chaque jour » : sans l'ordre, on lirait
    // « quotidien » et « ouvré » resterait orphelin dans le titre.
    expect(kind("Relever les mails chaque jour ouvré")).toBe("weekdays");
    expect(frag("Relever les mails chaque jour ouvré")).toBe("chaque jour ouvré");
  });

  it("capture le fragment entier, pas seulement le rythme", () => {
    expect(frag("Sortir les poubelles chaque lundi")).toBe("chaque lundi");
    expect(frag("Faire le ménage tous les mardis")).toBe("tous les mardis");
  });

  it("ignore ce qui suit la note", () => {
    expect(kind("Appeler Jean // à faire chaque lundi")).toBeNull();
  });

  it("ne voit pas de répétition là où il n'y en a pas", () => {
    expect(kind("Sortir les poubelles lundi")).toBeNull();
    expect(kind("acheter du pain")).toBeNull();
  });
});

describe("stripRecurrenceFromText", () => {
  const strip = (t: string) =>
    stripRecurrenceFromText(t, detectRecurrenceMatchFromText(t)?.match ?? null);

  it("retire la répétition du titre", () => {
    expect(strip("Sortir les poubelles chaque lundi")).toBe("Sortir les poubelles");
    expect(strip("Payer le loyer chaque mois")).toBe("Payer le loyer");
  });

  it("laisse le texte intact sans répétition", () => {
    expect(strip("Sortir les poubelles lundi")).toBe("Sortir les poubelles lundi");
  });
});
