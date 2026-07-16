import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { DateMatch } from "@/features/todos/smartParse";

interface HighlightedOverlayProps {
  text: string;
  dateMatch: DateMatch | null;
  listMatch?: DateMatch | null;
  tagMatches?: DateMatch[];
}

/**
 * Surligne les fragments détectés : date en bleu, projet `#nom` en violet,
 * tags `@nom` en émeraude. Trois couleurs distinctes = trois natures d'attribut.
 */
function HighlightedFragment({
  text,
  dateMatch,
  listMatch,
  tagMatches,
}: {
  text: string;
  dateMatch: DateMatch | null;
  listMatch?: DateMatch | null;
  tagMatches?: DateMatch[];
}) {
  const ranges: { start: number; end: number; className: string }[] = [];

  if (dateMatch && text.includes(dateMatch.text)) {
    const i = text.indexOf(dateMatch.text);
    ranges.push({ start: i, end: i + dateMatch.text.length, className: "text-blue-500" });
  }
  if (listMatch && text.includes(listMatch.text)) {
    const i = text.indexOf(listMatch.text);
    ranges.push({ start: i, end: i + listMatch.text.length, className: "text-violet-500" });
  }
  for (const tag of tagMatches ?? []) {
    const i = text.indexOf(tag.text);
    if (i !== -1) {
      ranges.push({ start: i, end: i + tag.text.length, className: "text-emerald-500" });
    }
  }

  if (ranges.length === 0) return <>{text}</>;

  ranges.sort((a, b) => a.start - b.start);

  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, k) => {
    if (r.start < cursor) return; // ignore les chevauchements éventuels
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <span key={k} className={r.className}>
        {text.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  });
  out.push(text.slice(cursor));

  return <>{out}</>;
}

/**
 * Calque rendu par-dessus le textarea transparent : affiche le texte avec
 * la date surlignée et la note (après `//`) mise en valeur.
 */
export function HighlightedOverlay({
  text,
  dateMatch,
  listMatch,
  tagMatches,
}: HighlightedOverlayProps) {
  const parts = text.split("//");

  if (parts.length <= 1) {
    return (
      <HighlightedFragment
        text={text}
        dateMatch={dateMatch}
        listMatch={listMatch}
        tagMatches={tagMatches}
      />
    );
  }

  const beforeSlash = parts[0];
  const afterSlash = parts.slice(1).join("//");

  return (
    <>
      <span className="text-foreground">
        <HighlightedFragment
          text={beforeSlash}
          dateMatch={dateMatch}
          listMatch={listMatch}
          tagMatches={tagMatches}
        />
      </span>
      <span className="relative">
        <span className="relative z-10 text-yellow-600 dark:text-yellow-400 font-normal">
          {"//"}
        </span>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-6 bg-yellow-400/40 dark:bg-yellow-500/30 blur-md rounded-full -z-10"
        />
      </span>
      {afterSlash.length === 0 ? (
        <span className="absolute text-muted-foreground/40 italic ml-1 select-none font-normal whitespace-nowrap">
          write note
        </span>
      ) : (
        <span className="text-yellow-700/80 dark:text-yellow-200/60 font-normal">
          {afterSlash}
        </span>
      )}
    </>
  );
}
