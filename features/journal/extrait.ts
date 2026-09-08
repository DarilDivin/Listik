import { MARQUE_DEBUT, MARQUE_FIN } from "./api";

/** Un morceau d'extrait : le texte, et s'il correspond à ce qu'on cherchait. */
export interface Morceau {
  texte: string;
  trouve: boolean;
}

/**
 * Découpe l'extrait rendu par FTS5 sur ses marques.
 *
 * Le SQL encadre les occurrences ; le front décide seulement comment les
 * montrer. On ne refait donc PAS la correspondance côté client — elle serait
 * fatalement différente de celle de l'index (accents, préfixes, tokenisation),
 * et surlignerait à côté.
 *
 * Une marque orpheline (extrait tronqué par `snippet`) ne casse rien : le
 * texte qui suit est simplement rendu tel quel.
 *
 * Le markdown part AVANT le découpage, et c'est l'ordre qui compte : la marque
 * tombe sur le mot trouvé, donc au MILIEU d'une syntaxe. Nettoyer chaque
 * morceau séparément ne verrait jamais qu'une moitié — `![La ` d'un côté,
 * `, juste avant.](piece:f9aa…)` de l'autre — et l'uuid resterait à l'écran.
 */
export function morceaux(extrait: string): Morceau[] {
  const out: Morceau[] = [];
  let reste = sansMarkdown(extrait);

  while (reste.length > 0) {
    const debut = reste.indexOf(MARQUE_DEBUT);
    if (debut === -1) break;
    const fin = reste.indexOf(MARQUE_FIN, debut + 1);
    if (fin === -1) break;
    if (debut > 0) out.push({ texte: reste.slice(0, debut), trouve: false });
    out.push({ texte: reste.slice(debut + 1, fin), trouve: true });
    reste = reste.slice(fin + 1);
  }

  if (reste.length > 0) out.push({ texte: reste, trouve: false });
  return out.filter((m) => m.texte.length > 0);
}

/**
 * Le markdown n'a rien à faire dans un extrait : `**gras**` s'y lirait avec
 * ses astérisques, et le lecteur verrait la mécanique au lieu du texte.
 *
 * On retire les marqueurs les plus courants, sans chercher à analyser — un
 * extrait est un fragment, souvent coupé au milieu d'une syntaxe.
 */
export function sansMarkdown(texte: string): string {
  // `[^\S\n]` et non `\s` : ce dernier avale le RETOUR À LA LIGNE qui précède
  // la puce, et deux lignes se retrouvent soudées — « le journall'assistant ».
  // C'est ce saut de ligne qui devient l'espace entre les deux.
  const bord = String.raw`[^\S\n]*`;
  return texte
    .replace(new RegExp(`^${bord}#{1,6}[^\\S\\n]+`, "gm"), "")
    .replace(new RegExp(`^${bord}>[^\\S\\n]?`, "gm"), "")
    .replace(new RegExp(`^${bord}[-*+][^\\S\\n]+`, "gm"), "")
    .replace(new RegExp(`^${bord}\\d+\\.[^\\S\\n]+`, "gm"), "")
    // Une image vaut sa LÉGENDE, un lien vaut son texte : la cible est de la
    // tuyauterie. Derrière une photo c'est même un renvoi interne
    // (`piece:<id>`) — un uuid en plein extrait ne dirait rien à personne.
    // Le `(?:\)|$)` tient compte de `snippet`, qui coupe à quatorze mots et
    // laisse volontiers une cible sans sa parenthèse fermante.
    .replace(/!?\[([^\]]*)\]\([^)]*(?:\)|$)/g, "$1")
    // Coupé de l'autre côté : l'extrait commence APRÈS le crochet ouvrant, et
    // il ne reste que la queue de la cible.
    .replace(/\]\([^)]*(?:\)|$)/g, "")
    // Et le `![` d'une image dont la légende, elle, a été tronquée.
    .replace(/!\[/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s*\n+\s*/g, " ");
}
