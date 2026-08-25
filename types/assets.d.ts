/**
 * Déclarations des imports d'assets que TypeScript ne connaît pas seul.
 *
 * Next fournit `next-env.d.ts`, mais celui-ci ne déclare RIEN pour les
 * feuilles de style globales : `import "./globals.css"` n'a donc aucun type.
 * `tsc` laissait passer, car il ne vérifie pas les imports à effet de bord
 * sans `noUncheckedSideEffectImports` — mais l'éditeur, lui, les vérifie et
 * signalait l'erreur. D'où la tentation d'un `@ts-expect-error` sur la ligne
 * d'import : mauvaise réponse, puisqu'une telle directive échoue à son tour
 * dès que l'erreur n'est plus levée, ce qui cassait `tsc`.
 *
 * Une déclaration règle le cas des deux côtés, et pour de bon.
 *
 * Le projet n'utilise aucun CSS Module (`*.module.css`) : cette déclaration
 * large ne masque donc le typage de personne. Si l'on en introduit, il faudra
 * leur donner une déclaration propre (un objet de classes) AVANT celle-ci.
 */
declare module "*.css";
