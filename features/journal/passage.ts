/**
 * Un passage du journal, prêt à partir : pour l'envoyer, pas pour l'archiver.
 *
 * L'export du journal entier (`export.ts`) range TOUT, avec les jours et les
 * heures : c'est une sauvegarde lisible. Ici, c'est l'inverse — un texte qu'on
 * vient d'écrire et qu'on veut faire lire. Il ne garde que ce que l'on a
 * écrit : ni repère, ni heure, ni renvoi interne.
 *
 * Le passage est lu sur les nœuds SÉRIALISÉS de Lexical, pas sur le markdown :
 * le souligné n'a pas de markdown, et repasser par le texte aurait demandé de
 * le réanalyser. Ce module ne touche pas au DOM, donc il se vérifie
 * (`passage.test.ts`). Chaque format de sortie part du même `Bloc[]`.
 */
import type { SerializedLexicalNode } from "lexical";

// Les drapeaux de `TextNode.__format` — constants depuis toujours dans Lexical,
// mais pas exportés par son paquet public.
const GRAS = 1;
const ITALIQUE = 1 << 1;
const BARRE = 1 << 2;
const SOULIGNE = 1 << 3;
const CODE = 1 << 4;

export interface Texte {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  barre?: boolean;
  souligne?: boolean;
  code?: boolean;
  /** Cible d'un lien — seulement http(s) et mailto, voir `lienSur`. */
  lien?: string;
}

/** Un morceau de ligne : du texte mis en forme, ou un retour à la ligne. */
export type Fragment = Texte | { saut: true };

export interface Liste {
  type: "liste";
  ordonnee: boolean;
  items: ItemListe[];
}

export interface ItemListe {
  fragments: Fragment[];
  sousListes: Liste[];
}

export type Bloc =
  | { type: "paragraphe"; fragments: Fragment[] }
  | { type: "titre"; niveau: number; fragments: Fragment[] }
  | { type: "citation"; fragments: Fragment[] }
  | Liste
  | { type: "code"; texte: string }
  | { type: "piece"; pieceId: string; legende: string };

type Noeud = SerializedLexicalNode & {
  children?: Noeud[];
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  pieceId?: string;
  legende?: string;
};

/**
 * Une cible de lien qu'on peut écrire dans un document qui part ailleurs.
 *
 * `javascript:` dans un HTML collé ou dans un .docx serait un piège posé chez
 * le lecteur. On ne garde que le web et le courrier ; le texte du lien, lui,
 * reste toujours.
 */
function lienSur(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : undefined;
}

function fragments(enfants: Noeud[] = [], lien?: string): Fragment[] {
  const out: Fragment[] = [];
  for (const n of enfants) {
    switch (n.type) {
      case "text":
      case "code-highlight":
      case "tab": {
        const f = n.format ?? 0;
        const t: Texte = { texte: n.type === "tab" ? "\t" : (n.text ?? "") };
        if (f & GRAS) t.gras = true;
        if (f & ITALIQUE) t.italique = true;
        if (f & BARRE) t.barre = true;
        if (f & SOULIGNE) t.souligne = true;
        if (f & CODE) t.code = true;
        if (lien) t.lien = lien;
        if (t.texte !== "") out.push(t);
        break;
      }
      case "linebreak":
        out.push({ saut: true });
        break;
      case "link":
      case "autolink":
        out.push(...fragments(n.children, lienSur(n.url)));
        break;
      default:
        // Un nœud en ligne qu'on ne connaît pas : on garde au moins son texte.
        if (n.children) out.push(...fragments(n.children, lien));
    }
  }
  return out;
}

function liste(n: Noeud): Liste {
  const l: Liste = { type: "liste", ordonnee: n.listType === "number", items: [] };
  for (const item of n.children ?? []) {
    const enfants = item.children ?? [];
    const imbriquees = enfants.filter((c) => c.type === "list").map(liste);
    const enLigne = enfants.filter((c) => c.type !== "list");
    // Lexical range une sous-liste dans un `listitem` À ELLE, sans texte, qui
    // suit l'élément qu'elle détaille. On la raccroche à ce dernier : c'est
    // ainsi que le lecteur la voit, et ainsi que Word et HTML l'imbriquent.
    const precedent = l.items[l.items.length - 1];
    if (enLigne.length === 0 && imbriquees.length > 0 && precedent) {
      precedent.sousListes.push(...imbriquees);
      continue;
    }
    l.items.push({ fragments: fragments(enLigne), sousListes: imbriquees });
  }
  return l;
}

function bloc(n: Noeud): Bloc | null {
  switch (n.type) {
    case "paragraph":
      return { type: "paragraphe", fragments: fragments(n.children) };
    case "heading":
      return {
        type: "titre",
        niveau: Number(n.tag?.slice(1)) || 1,
        fragments: fragments(n.children),
      };
    case "quote":
      return { type: "citation", fragments: fragments(n.children) };
    case "list":
      return liste(n);
    case "code":
      return {
        type: "code",
        texte: fragments(n.children)
          .map((f) => ("saut" in f ? "\n" : f.texte))
          .join(""),
      };
    case "piece":
      return { type: "piece", pieceId: n.pieceId ?? "", legende: n.legende ?? "" };
    case "repere":
      // L'heure d'une reprise est la gouttière de la page : elle n'a rien à
      // faire dans un texte qu'on envoie.
      return null;
    default:
      // Un bloc inconnu garde son texte plutôt que de disparaître.
      return n.children ? { type: "paragraphe", fragments: fragments(n.children) } : null;
  }
}

const estBlanc = (b: Bloc) =>
  b.type === "paragraphe" &&
  b.fragments.every((f) => "saut" in f || f.texte.trim() === "");

/**
 * Les nœuds d'un passage deviennent des blocs.
 *
 * Les paragraphes vides des BORDS tombent — la feuille finit toujours par
 * une ligne blanche, l'endroit où l'on écrit. Ceux du milieu restent : dans
 * une nouvelle, une ligne vide est souvent une coupure de scène.
 */
export function blocsDepuisNoeuds(noeuds: SerializedLexicalNode[]): Bloc[] {
  const blocs = (noeuds as Noeud[]).map(bloc).filter((b): b is Bloc => b !== null);
  let debut = 0;
  let fin = blocs.length;
  while (debut < fin && estBlanc(blocs[debut])) debut++;
  while (fin > debut && estBlanc(blocs[fin - 1])) fin--;
  return blocs.slice(debut, fin);
}

/**
 * La reprise qui contient le bloc `index` de la feuille, et son heure.
 *
 * Même découpe que `decouperEnSegments` : ce qui précède le PREMIER repère
 * appartient à la reprise que ce repère ouvre. Exporter « ce passage » doit
 * rendre exactement le moment que la page enregistre, pas une variante.
 */
export function repriseAutour(
  racine: SerializedLexicalNode[],
  index: number,
): { heure: string; noeuds: SerializedLexicalNode[] } {
  const reperes = racine.flatMap((n, i) => (n.type === "repere" ? [i] : []));
  // Le début de chaque reprise ; la première commence toujours en haut.
  const debuts = [0, ...reperes.slice(1)];
  let k = 0;
  while (k + 1 < debuts.length && debuts[k + 1] <= index) k++;
  const fin = debuts[k + 1] ?? racine.length;
  const repere = racine[reperes[k] ?? -1] as (SerializedLexicalNode & { heure?: string }) | undefined;
  return { heure: repere?.heure ?? "", noeuds: racine.slice(debuts[k], fin) };
}

// ---------------------------------------------------------------------------
// Texte brut — pour un message.

const ligne = (fs: Fragment[]) => fs.map((f) => ("saut" in f ? "\n" : f.texte)).join("");

function listeEnTexte(l: Liste, retrait: string): string[] {
  return l.items.flatMap((item, i) => [
    `${retrait}${l.ordonnee ? `${i + 1}.` : "•"} ${ligne(item.fragments)}`,
    ...item.sousListes.flatMap((s) => listeEnTexte(s, `${retrait}   `)),
  ]);
}

/**
 * Le passage en texte brut : ce qu'on colle dans une messagerie.
 *
 * Aucune syntaxe : un astérisque ou un dièse se lirait tel quel chez celui qui
 * reçoit. Les pièces jointes n'y ont pas de place — une photo ne se colle pas
 * dans un texte, et sa légende seule, hors contexte, ne dirait rien.
 */
export function enTexte(blocs: Bloc[]): string {
  const parties: string[] = [];
  for (const b of blocs) {
    switch (b.type) {
      case "paragraphe":
      case "titre":
      case "citation":
        parties.push(ligne(b.fragments));
        break;
      case "liste":
        parties.push(listeEnTexte(b, "").join("\n"));
        break;
      case "code":
        parties.push(b.texte);
        break;
      case "piece":
        break;
    }
  }
  return parties.join("\n\n");
}

// ---------------------------------------------------------------------------
// HTML — pour le collage mis en forme, le PDF et l'image.

const echapper = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fragmentsEnHtml(fs: Fragment[]): string {
  if (fs.length === 0) return "<br>";
  return fs
    .map((f) => {
      if ("saut" in f) return "<br>";
      let h = echapper(f.texte);
      if (f.code) h = `<code>${h}</code>`;
      if (f.gras) h = `<strong>${h}</strong>`;
      if (f.italique) h = `<em>${h}</em>`;
      if (f.souligne) h = `<u>${h}</u>`;
      if (f.barre) h = `<s>${h}</s>`;
      if (f.lien) h = `<a href="${echapper(f.lien)}">${h}</a>`;
      return h;
    })
    .join("");
}

function listeEnHtml(l: Liste): string {
  const tag = l.ordonnee ? "ol" : "ul";
  const items = l.items
    .map((i) => `<li>${fragmentsEnHtml(i.fragments)}${i.sousListes.map(listeEnHtml).join("")}</li>`)
    .join("");
  return `<${tag}>${items}</${tag}>`;
}

/**
 * Le passage en HTML.
 *
 * `images` donne, pour chaque pièce, la source à montrer — absente, la pièce
 * ne paraît pas. Seules les IMAGES partent : un PDF joint, un document ou une
 * note vocale ne s'impriment pas dans une page, et une vignette muette n'y
 * dirait rien.
 */
export function enHtml(blocs: Bloc[], images: ReadonlyMap<string, string> = new Map()): string {
  return blocs
    .map((b) => {
      switch (b.type) {
        case "paragraphe":
          return `<p>${fragmentsEnHtml(b.fragments)}</p>`;
        case "titre": {
          const n = Math.min(Math.max(b.niveau, 1), 6);
          return `<h${n}>${fragmentsEnHtml(b.fragments)}</h${n}>`;
        }
        case "citation":
          return `<blockquote>${fragmentsEnHtml(b.fragments)}</blockquote>`;
        case "liste":
          return listeEnHtml(b);
        case "code":
          return `<pre>${echapper(b.texte)}</pre>`;
        case "piece": {
          const src = images.get(b.pieceId);
          if (!src) return "";
          const legende = b.legende.trim()
            ? `<figcaption>${echapper(b.legende)}</figcaption>`
            : "";
          return `<figure><img src="${echapper(src)}" alt="${echapper(b.legende)}">${legende}</figure>`;
        }
      }
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Ce qu'on dit du passage, et le nom de son fichier.

/** Les pièces que cite le passage, sans doublon. */
export function piecesDe(blocs: Bloc[]): string[] {
  const ids = blocs.flatMap((b) => (b.type === "piece" && b.pieceId ? [b.pieceId] : []));
  return [...new Set(ids)];
}

/** Nombre de mots — ce que le menu affiche pour dire CE qui va partir. */
export function compterMots(blocs: Bloc[]): number {
  return enTexte(blocs)
    .split(/\s+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

/**
 * Le nom proposé pour le fichier : la première ligne écrite.
 *
 * Un titre en tête du texte devient donc le nom, sans rien demander de plus ;
 * et le dialogue « Enregistrer sous » laisse le changer. Les caractères
 * interdits par Windows tombent, la longueur s'arrête à un mot entier.
 */
export function nomDeFichier(blocs: Bloc[], extension: string): string {
  const premier = blocs.find((b) => b.type !== "piece" && enTexte([b]).trim() !== "");
  let base = premier ? enTexte([premier]).split("\n")[0] : "";
  base = base
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length > 60) {
    const coupe = base.slice(0, 60);
    const espace = coupe.lastIndexOf(" ");
    base = espace > 20 ? coupe.slice(0, espace) : coupe;
  }
  base = base.replace(/[. ]+$/, "");
  return `${base || "passage"}.${extension}`;
}
