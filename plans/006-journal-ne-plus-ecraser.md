# Plan 006 : La feuille du journal ne réécrit plus du texte qu'elle n'a pas chargé

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- components/journal/JournalSheet.tsx features/journal/feuille.ts features/journal/feuille.test.ts features/journal/useFeuille.ts`
> Si un de ces fichiers a changé depuis l'écriture du plan, compare les extraits
> de « État actuel » au code réel ; en cas d'écart, c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : M
- **Risque** : MED — c'est le chemin d'enregistrement qui a déjà perdu des
  données deux fois (septembre et octobre 2026).
- **Dépend de** : aucun (le plan 001 aide : il documente les conventions)
- **Catégorie** : bug
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Le journal est une seule « feuille » (un éditeur Lexical) découpée en
« reprises » (des moments, chacun une ligne `journal_entries` en base). Pour ne
pas remplacer le texte sous le curseur, la feuille **refuse de se recharger
tant que le curseur est dedans**. Or le curseur reste « dedans » même quand
l'utilisateur est passé dans une autre fenêtre. Scénario réel :

1. On écrit dans la page Journal (ou le widget de l'accueil).
2. Alt+Q → Journal : on ajoute une ligne. Rust la **fond** dans le moment
   ouvert, c'est-à-dire dans la même ligne en base que celle de la page.
3. On revient à la page et on tape une lettre : la page compare son texte
   périmé à la base, voit une différence, et **réécrit sa version** — la ligne
   ajoutée à l'étape 2 disparaît, sans message.

Variantes du même défaut :
- **Première ouverture du Journal dans Alt+Q** : le curseur est posé avant que
  le jour soit chargé, la feuille refuse ensuite le chargement, et le texte
  tapé peut être enregistré en double ou effacé.
- **Après minuit**, le widget et la barre rapide changent de jour sous la
  feuille ; les moments d'avant minuit ne sont plus reconnus et leurs
  modifications sont ignorées en silence.
- **L'enregistrement différé (700 ms) est annulé** à chaque nouveau rendu du
  composant parent, et à la fermeture de la barre rapide.

Après ce plan : la feuille se recharge quand personne n'y écrit vraiment
(fenêtre en arrière-plan, ou curseur posé sans rien taper) ; un chargement
n'est jamais pris pour une frappe ; une sauvegarde en attente part toujours ;
et un moment chargé avant minuit reste enregistrable.

## État actuel

Fichiers :
- `components/journal/JournalSheet.tsx` — l'éditeur et ses plugins internes
  (`ChargementPlugin` l.116-150, `SauvegardePlugin` l.234-286,
  `IdentitePlugin` l.294-328) ; branchement des plugins l.706-716.
- `features/journal/useFeuille.ts` — l'état d'une feuille et `enregistrer`
  (l.129-172).
- `features/journal/feuille.ts` — fonctions pures (découpage en segments,
  `entreesASupprimer`, `estVide`) ; testées par
  `features/journal/feuille.test.ts`.
- Hôtes (à **ne pas** modifier) : `app/(app)/journal/page.tsx` (monte la
  feuille avec `key={day}`), `components/planner/JournalWidget.tsx` et
  `components/BarreJournal.tsx` (calculent `todayLocalISODate()` à chaque rendu
  et passent un `onSegments` écrit en ligne, donc nouveau à chaque rendu).

`ChargementPlugin`, le refus de recharger (`JournalSheet.tsx:127-148`) :
```tsx
useEffect(() => {
  if (pose.current === signature) return;
  const dom = editor.getRootElement();
  // … (commentaire sur `contains` plutôt que `===`)
  const ecrit = dom !== null && dom.contains(document.activeElement);
  if (ecrit && pose.current !== null) return;
  pose.current = signature;
  afficheesRef.current = new Set(reprises.map((r) => r.id).filter((id) => id !== ""));
  editor.update(() => $poserFeuille(reprises));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [signature, editor]);
```
`document.activeElement` reste sur l'éditeur quand la **fenêtre** perd le
focus : `ecrit` vaut donc `true` alors que l'utilisateur écrit ailleurs.

`SauvegardePlugin` (`JournalSheet.tsx:242-283`) :
```tsx
useEffect(() => {
  const pousser = () => {
    minuteur.current = null;
    const racine = editor.getEditorState().toJSON().root.children;
    onSegments(decouperEnSegments(racine));
  };
  const stop = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(pousser, 700);
  });
  const dom = editor.getRootElement();
  const surBlur = () => {
    if (!minuteur.current) return;
    clearTimeout(minuteur.current);
    minuteur.current = null;
    pousser();
  };
  dom?.addEventListener("blur", surBlur);
  return () => {
    stop();
    dom?.removeEventListener("blur", surBlur);
    if (minuteur.current) clearTimeout(minuteur.current);
  };
}, [editor, onSegments]);
```
Deux défauts : (a) `onSegments` change à chaque rendu de l'hôte (voir
`pousserSegments`, `JournalSheet.tsx:642-645`, qui dépend de `onSegments`) →
l'effet se réabonne et **efface le minuteur sans enregistrer** ; (b) la pose
d'une feuille par `ChargementPlugin` est elle-même une mise à jour « sale » →
elle déclenche un enregistrement, qui peut écrire un contenu périmé si la base
a bougé entre-temps.

`IdentitePlugin` (`JournalSheet.tsx:303-322`) ajoute l'entrée créée aux
entrées « affichées » **avant** de vérifier qu'un repère vierge existe :
```tsx
afficheesRef.current.add(aStamper.id);
let cle: string | null = null;
editor.update(() => {
  const vierge = $getRoot().getChildren().find(/* repère sans id */);
  if (!vierge) return;
  vierge.setIdentite(aStamper.id, aStamper.heure);
  cle = vierge.getKey();
});
if (cle === null) return;
```
Une entrée « affichée » peut être effacée par la sauvegarde suivante si elle
n'est pas dans la feuille (`entreesASupprimer`) : l'ajouter alors qu'elle n'a
pas été posée a fait disparaître du texte.

`useFeuille.enregistrer` (`useFeuille.ts:153-163`), le saut silencieux :
```ts
vues.add(s.entryId);
const avant = connues.find((e) => e.id === s.entryId);
if (avant === undefined) continue;
if (estVide(s.markdown)) {
  await track(deleteEntry(s.entryId));
  continue;
}
if (s.markdown !== avant.content) {
  await track(updateEntry(s.entryId, { content: s.markdown }));
}
```
`connues` = `entriesRef.current` = les entrées du jour **courant** du hook. Après
minuit, les moments d'hier encore dans la feuille ne s'y trouvent plus.
`updateEntry(id, …)` n'a pas besoin du jour : il met à jour par identifiant.

Conventions : commentaires en français, qui expliquent le *pourquoi* (voir
ceux, très détaillés, de `JournalSheet.tsx`) ; les fonctions pures vont dans
`feuille.ts` et se testent dans `feuille.test.ts` (style :
`describe("entreesASupprimer", () => { it("…", …) })`, l.180-200).
Lexical est en version 0.49 : `editor.update(fn, { tag: "…" })` pose une
étiquette que reçoit `registerUpdateListener(({ tags }) => …)` (`tags` est un
`Set<string>`).

## Commandes utiles

| But | Commande | Attendu |
|---|---|---|
| Tests du journal | `pnpm exec vitest run features/journal` | tous passent |
| Front complet | `pnpm check` | exit 0 |
| Lint | `pnpm lint` | « No ESLint warnings or errors » |

## Périmètre

**Dans le périmètre** :
- `features/journal/feuille.ts` (deux fonctions pures)
- `features/journal/feuille.test.ts`
- `components/journal/JournalSheet.tsx` (`ChargementPlugin`,
  `SauvegardePlugin`, `IdentitePlugin`, une constante)
- `features/journal/useFeuille.ts` (`enregistrer` et une mémoire des contenus)

**Hors périmètre** :
- `app/(app)/journal/page.tsx`, `components/planner/JournalWidget.tsx`,
  `components/BarreJournal.tsx` — les hôtes ne changent pas.
- `src-tauri/**` (dont `append_journal_entry`) — la fusion côté Rust est
  correcte ; ajouter une vérification de version côté base est une piste
  reportée (voir Notes).
- `entreesASupprimer` — sa règle est juste ; ne pas la modifier.
- Le comportement du repère vierge, des heures, des pièces jointes.

## Git

- Branche : `advisor/006-journal-ne-plus-ecraser`
- Un commit par étape 2 à 5, style du dépôt, par exemple :
  `fix(journal): reload the sheet when nobody is really typing in it`
- Ne pas pousser, ne pas ouvrir de PR sauf instruction de l'opérateur.

## Étapes

### Étape 1 : Deux fonctions pures, testées

Dans `features/journal/feuille.ts`, ajoute (après `entreesASupprimer`) :

```ts
/**
 * La feuille peut-elle se recharger maintenant ?
 *
 * On ne refuse que si quelqu'un ÉCRIT vraiment dedans : curseur dans
 * l'éditeur, fenêtre au premier plan, et au moins une frappe depuis le dernier
 * chargement. Le curseur reste dans l'éditeur quand la fenêtre passe en
 * arrière-plan — refuser alors laissait la feuille périmée, et sa prochaine
 * sauvegarde effaçait ce qu'une autre fenêtre avait écrit.
 */
export function peutRecharger(etat: {
  dejaPosee: boolean;
  curseurDedans: boolean;
  fenetreActive: boolean;
  tapeDepuisPose: boolean;
}): boolean {
  if (!etat.dejaPosee) return true;
  if (!etat.curseurDedans || !etat.fenetreActive) return true;
  return !etat.tapeDepuisPose;
}

/**
 * Le contenu en base d'une entrée de la feuille : celui du jour courant, ou,
 * pour un moment d'un AUTRE jour (la feuille a passé minuit sans se
 * recharger), le dernier connu.
 *
 * Une entrée du jour courant absente de `connues` a été supprimée ailleurs :
 * on la laisse (`undefined`), sinon chaque sauvegarde tenterait de mettre à
 * jour une ligne disparue et afficherait une erreur.
 */
export function contenuAvant(
  id: string,
  connues: readonly { id: string; content: string }[],
  memoire: ReadonlyMap<string, { jour: string; content: string }>,
  jour: string,
): string | undefined {
  const duJour = connues.find((e) => e.id === id);
  if (duJour) return duJour.content;
  const vue = memoire.get(id);
  return vue && vue.jour !== jour ? vue.content : undefined;
}
```

Dans `features/journal/feuille.test.ts`, importe-les et ajoute :

- `describe("peutRecharger")` : un `it` par cas :
  1. jamais posée → `true` même si curseur dedans, fenêtre active et frappe ;
  2. curseur ailleurs → `true` ;
  3. fenêtre en arrière-plan (curseur dedans, frappe) → `true` ;
  4. curseur dedans, fenêtre active, **rien tapé** → `true` ;
  5. curseur dedans, fenêtre active, frappe → `false`.
- `describe("contenuAvant")` (jour courant `"2026-10-22"`) :
  1. une entrée du jour → son contenu ;
  2. absente du jour, en mémoire avec `jour: "2026-10-21"` → le contenu en
     mémoire (moment d'avant minuit) ;
  3. absente du jour, en mémoire avec `jour: "2026-10-22"` → `undefined`
     (supprimée ailleurs le même jour) ;
  4. absente partout → `undefined` ;
  5. présente dans les deux → le contenu **du jour** l'emporte.

**Vérifier** : `pnpm exec vitest run features/journal` → tous passent, dont
les 10 nouveaux cas.

### Étape 2 : `ChargementPlugin` recharge quand personne n'écrit

Dans `components/journal/JournalSheet.tsx` :

1. Ajoute, près du haut du fichier (après les imports) :
   ```ts
   /**
    * Étiquette des mises à jour faites PAR LE PROGRAMME (poser la feuille,
    * estampiller un repère) : ce ne sont pas des frappes. La sauvegarde et la
    * détection de frappe les ignorent.
    */
   const TAG_PROGRAMME = "journal-programme";
   ```
2. Dans `ChargementPlugin`, ajoute un ref `tapeRef = useRef(false)` et un
   effet qui écoute les frappes :
   ```tsx
   useEffect(
     () =>
       editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
         if (tags.has(TAG_PROGRAMME)) return;
         if (dirtyElements.size > 0 || dirtyLeaves.size > 0) tapeRef.current = true;
       }),
     [editor],
   );
   ```
3. Remplace, dans l'effet existant, les lignes
   `const ecrit = …; if (ecrit && pose.current !== null) return;` et
   `editor.update(() => $poserFeuille(reprises));` par :
   ```tsx
   const curseurDedans = dom !== null && dom.contains(document.activeElement);
   const ok = peutRecharger({
     dejaPosee: pose.current !== null,
     curseurDedans,
     fenetreActive: document.hasFocus(),
     tapeDepuisPose: tapeRef.current,
   });
   if (!ok) return;
   pose.current = signature;
   tapeRef.current = false;
   afficheesRef.current = new Set(reprises.map((r) => r.id).filter((id) => id !== ""));
   editor.update(
     () => {
       $poserFeuille(reprises);
       // Le curseur était là : on le remet au bout, où l'on reprend d'écrire.
       if (curseurDedans) $getRoot().selectEnd();
     },
     { tag: TAG_PROGRAMME },
   );
   ```
   Garde le commentaire existant sur `contains` et le
   `// eslint-disable-next-line react-hooks/exhaustive-deps` au-dessus du
   tableau de dépendances. Mets à jour le commentaire de tête de
   `ChargementPlugin` (« Jamais pendant qu'on écrit dedans… ») pour dire la
   nouvelle règle en une phrase.
4. Importe `peutRecharger` depuis `@/features/journal/feuille` (là où ce
   fichier importe déjà d'autres fonctions de `feuille`), et vérifie que
   `$getRoot` est bien importé de `lexical` (il l'est déjà, utilisé par
   `IdentitePlugin`).

**Vérifier** : `pnpm typecheck` → exit 0 ; `pnpm lint` → sans avertissement.

### Étape 3 : `SauvegardePlugin` n'annule plus, n'enregistre pas les chargements

Dans `SauvegardePlugin` :

1. Garde la dernière version de `onSegments` dans un ref, et ne t'abonne
   qu'une fois :
   ```tsx
   // La dernière version, sans se réabonner : l'hôte en passe une nouvelle à
   // chaque rendu, et se réabonner effaçait le minuteur en attente.
   const onSegmentsRef = useRef(onSegments);
   onSegmentsRef.current = onSegments;
   ```
   Dans `pousser`, appelle `onSegmentsRef.current(decouperEnSegments(racine))`.
   Le tableau de dépendances de l'effet devient `[editor]`.
2. Dans l'écouteur de mises à jour, ignore les mises à jour du programme :
   ```tsx
   const stop = editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
     if (tags.has(TAG_PROGRAMME)) return;
     if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
     …
   ```
3. Au démontage, **enregistre** ce qui attendait au lieu de l'effacer : dans
   le `return () => { … }`, remplace
   `if (minuteur.current) clearTimeout(minuteur.current);` par :
   ```tsx
   // Fermer la barre rapide ou quitter la page ne doit pas perdre les
   // dernières frappes : ce qui attendait part maintenant.
   if (minuteur.current) {
     clearTimeout(minuteur.current);
     pousser();
   }
   ```

**Vérifier** : `pnpm typecheck` → exit 0 ; `pnpm lint` → sans avertissement ;
`grep -n "\[editor, onSegments\]" components/journal/JournalSheet.tsx` → aucune ligne.

### Étape 4 : `IdentitePlugin` n'annonce que ce qu'il a vraiment posé

Dans `IdentitePlugin` :

1. Déplace `afficheesRef.current.add(aStamper.id);` **après**
   `if (cle === null) return;` (une entrée n'est « affichée » que si son
   repère a bien été estampillé). Adapte le commentaire.
2. Étiquette la mise à jour : `editor.update(() => { … }, { tag: TAG_PROGRAMME });`.

**Vérifier** : `pnpm typecheck` → exit 0.

### Étape 5 : `enregistrer` reconnaît les moments d'avant minuit

Dans `features/journal/useFeuille.ts` :

1. À côté de `entriesRef` (l.118), ajoute une mémoire :
   ```ts
   // Tout ce que ce hook a vu passer, jours confondus. La feuille du widget et
   // de la barre rapide change de jour à minuit sans se recharger si l'on y
   // écrit : ses moments d'hier doivent rester enregistrables.
   const memoireRef = useRef(new Map<string, { jour: string; content: string }>());
   for (const e of entries) {
     memoireRef.current.set(e.id, { jour: e.target_day, content: e.content });
   }
   ```
   (`JournalEntry` a bien un champ `target_day` : vérifie-le dans
   `features/journal/generated/JournalEntry.ts`.)
2. Dans `enregistrer`, remplace le bloc cité dans « État actuel » par :
   ```ts
   vues.add(s.entryId);
   const avant = contenuAvant(s.entryId, connues, memoireRef.current, day);
   if (avant === undefined) continue;
   if (estVide(s.markdown)) {
     await track(deleteEntry(s.entryId));
     continue;
   }
   if (s.markdown !== avant) {
     const ecrit = await track(updateEntry(s.entryId, { content: s.markdown }));
     if (ecrit) {
       const jour = memoireRef.current.get(s.entryId)?.jour ?? day;
       memoireRef.current.set(s.entryId, { jour, content: s.markdown });
     }
   }
   ```
   (`track` rend `null` en cas d'échec, voir son commentaire.) Importe
   `contenuAvant` depuis `./feuille`.
   Ne change rien à la boucle finale `entreesASupprimer(connues, vues, affichees)`.

**Vérifier** : `pnpm typecheck` → exit 0 ; `pnpm exec vitest run features/journal` → tous passent.

### Étape 6 : Vérification d'ensemble

**Vérifier** : `pnpm check` → exit 0 ; `pnpm lint` → sans avertissement ;
`git status --short` → seulement les 4 fichiers du périmètre (+ `plans/README.md`).

## Plan de test

- Automatiques (étape 1) : 10 cas pour `peutRecharger` et `contenuAvant` dans
  `features/journal/feuille.test.ts`. Les plugins React ne sont pas testables
  dans vitest (environnement `node`, sans DOM) : leur logique de décision est
  dans ces fonctions pures.
- Manuels, **à faire par l'opérateur** avant de fusionner (`pnpm tauri dev`) :
  1. Page Journal : écrire « A » dans le moment courant, attendre 2 s. Alt+Q →
     Journal : écrire « B », Échap. Revenir à la page, cliquer au bout du
     texte, écrire « C », attendre 2 s, aller sur une autre page puis revenir
     au Journal. **Attendu** : A, B et C sont tous là.
  2. Quitter et relancer l'app. Aussitôt, Alt+Q → Journal, écrire « X »,
     attendre 2 s, écrire « Z » à la suite, attendre encore 2 s (deux
     enregistrements), Échap. Rouvrir Alt+Q → Journal. **Attendu** : « X » et
     « Z » une seule fois chacun. Si du texte est doublé, le noter dans le
     compte rendu (risque résiduel décrit dans les Notes).
  3. Alt+Q → Journal, écrire « Y » et appuyer sur Échap **immédiatement**
     (moins d'une seconde). Rouvrir. **Attendu** : « Y » est là.

## Critères de fin

- [ ] `pnpm check` exit 0, dont 10 nouveaux cas dans `feuille.test.ts`
- [ ] `pnpm lint` sans avertissement
- [ ] `grep -c "TAG_PROGRAMME" components/journal/JournalSheet.tsx` ≥ 5 (définition, 2 étiquetages, 2 filtres)
- [ ] `grep -n "if (avant === undefined) continue;" features/journal/useFeuille.ts` → une ligne, précédée de l'appel à `contenuAvant`
- [ ] `git status --short` : seulement les 4 fichiers du périmètre (+ `plans/README.md`)
- [ ] La ligne du plan 006 est à jour dans `plans/README.md`, avec la mention « tests manuels à faire par l'opérateur »

## Conditions d'arrêt

- Les extraits de `ChargementPlugin`, `SauvegardePlugin`, `IdentitePlugin` ou
  `enregistrer` ne correspondent plus au code : rendre compte.
- `registerUpdateListener` ne fournit pas `tags`, ou `editor.update` n'accepte
  pas `{ tag }` dans la version de Lexical installée
  (`node_modules/lexical/package.json`) : rendre compte, ne pas contourner.
- Un test existant de `features/journal` échoue après une étape.
- La correction semble exiger de modifier un hôte (page, widget, barre
  rapide) ou `src-tauri` : rendre compte.

## Notes de maintenance

- Règle d'or de ce fichier : **une mise à jour faite par le programme porte
  `TAG_PROGRAMME`**. Toute nouvelle mise à jour programmatique de la feuille
  (insertion de pièce automatique, etc.) doit la porter, sinon elle sera prise
  pour une frappe et bloquera les rechargements.
- Effet visible voulu : quand la feuille se recharge alors que le curseur y
  était (fenêtre revenue au premier plan), le curseur revient **au bout** du
  texte, pas à sa place d'avant.
- **Risque résiduel connu (doublons)** : si Rust fond le texte d'un repère
  vierge dans un moment encore ouvert (la page croyait la session close),
  l'éditeur garde ce repère vierge, et chaque sauvegarde suivante renvoie son
  texte à fondre — il se répète. Ce plan rend le cas rare (une feuille encore
  vierge se recharge désormais), il ne le supprime pas. Le vrai correctif :
  quand `enregistrer` constate la fusion (`connues.some((e) => e.id === cree.id)`),
  demander à la feuille de retirer le repère vierge (même mécanisme que
  `aStamper`).
- Reporté, pour une protection complète : faire porter à
  `update_journal_entry` (Rust) la date `updated_at` attendue, et refuser
  l'écriture si la ligne a changé entre-temps. Ce plan supprime les causes
  connues ; ce verrou fermerait les causes inconnues.
- À relire avec soin : le démontage de `SauvegardePlugin` (il appelle
  maintenant `pousser`), et l'ordre de l'étape 4 (l'ajout aux « affichées »
  après le test `cle === null`).
