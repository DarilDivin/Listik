// Découpage d'une saisie de capture en segments affichables : le texte
// ordinaire et les fragments reconnus (date, projet, tag, note).
//
// Logique PURE, sans React ni Lexical : c'est elle la source de vérité de ce
// qui est reconnu, l'éditeur ne fait que la rendre. Elle est donc testable
// seule, comme `smartParse` dont elle réutilise les détecteurs — aucune
// nouvelle grammaire n'est inventée ici.
import {
  detectListFromText,
  detectPriorityMatchFromText,
  detectTagMatchesFromText,
  parseTaskDate,
  type DateMatch,
} from "../todos/smartParse";

/**
 * Nature d'un fragment reconnu. Le marqueur `//` est séparé du corps de la
 * note : c'est LUI qui porte le halo, la note n'étant que du texte libre.
 */
export type TokenKind =
  | "date"
  | "project"
  | "tag"
  | "priority"
  | "note"
  | "noteMarker";

export interface Segment {
  /** `null` = texte ordinaire. */
  kind: TokenKind | null;
  text: string;
  start: number;
  end: number;
}

/** Fragment repéré avant résolution des chevauchements. */
interface Range {
  kind: TokenKind;
  start: number;
  end: number;
}

/**
 * Découpe `text` en segments contigus qui le recouvrent entièrement — leur
 * concaténation redonne toujours la saisie exacte. Les segments vides ne sont
 * jamais émis.
 *
 * Priorité en cas de chevauchement : le premier commencé gagne, comme dans le
 * surlignage historique. Un fragment ne peut donc jamais être coupé en deux.
 */
export interface TokenizeOptions {
  /**
   * Ne pas reconnaitre le mot de priorite. Sert quand l'utilisateur a fixe la
   * priorite a la main : le mot redevient alors un mot de la phrase, et non
   * plus l'attribut. Voir `CaptureField`.
   */
  skipPriority?: boolean;
}

export function tokenizeCapture(
  text: string,
  options: TokenizeOptions = {},
): Segment[] {
  if (!text) return [];

  const ranges: Range[] = [];

  // La note (`//` jusqu'à la fin) est prioritaire : elle ferme le texte, et
  // aucun autre marqueur n'est reconnu à l'intérieur.
  const noteAt = text.indexOf("//");
  const head = noteAt === -1 ? text : text.slice(0, noteAt);
  if (noteAt !== -1) {
    ranges.push({ kind: "noteMarker", start: noteAt, end: noteAt + 2 });
    ranges.push({ kind: "note", start: noteAt + 2, end: text.length });
  }

  const push = (kind: TokenKind, match: DateMatch | undefined | null) => {
    if (!match) return;
    // Un marqueur détecté au-delà de `//` appartient à la note.
    if (match.index >= head.length) return;
    ranges.push({
      kind,
      start: match.index,
      end: match.index + match.text.length,
    });
  };

  push("date", parseTaskDate(head)?.match);
  push("project", detectListFromText(head)?.match);
  for (const tag of detectTagMatchesFromText(head)) push("tag", tag.match);
  // La priorité passe APRÈS les tags : « @urgent » commence avant le « urgent »
  // qu'il contient, il gagne donc le chevauchement — le tag reste un tag.
  if (!options.skipPriority) {
    push("priority", detectPriorityMatchFromText(head)?.match);
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: Segment[] = [];
  let cursor = 0;
  const emit = (kind: TokenKind | null, start: number, end: number) => {
    if (end <= start) return;
    segments.push({ kind, text: text.slice(start, end), start, end });
  };

  for (const range of ranges) {
    if (range.start < cursor) continue; // chevauchement : le premier a gagné
    emit(null, cursor, range.start);
    emit(range.kind, range.start, range.end);
    cursor = range.end;
  }
  emit(null, cursor, text.length);

  return segments;
}
