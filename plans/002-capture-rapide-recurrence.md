# Plan 002 : La capture rapide (Alt+Q) garde la récurrence, via un seul constructeur de tâche partagé

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- features/todos/useCaptureTask.ts hooks/usePlannerTodos.ts features/todos/useTaskMode.ts features/todos/types.ts lib/date.ts`
> Si un de ces fichiers a changé depuis l'écriture du plan, compare les extraits
> de « État actuel » au code réel ; en cas d'écart, c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : S
- **Risque** : LOW
- **Dépend de** : aucun (le plan 001 aide, sans être requis)
- **Catégorie** : bug
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Taper « Sortir les poubelles chaque lundi » dans la barre rapide (Alt+Q) crée
aujourd'hui une tâche **unique** « Sortir les poubelles » : l'analyse retire
« chaque lundi » du titre, puis la création oublie de transmettre la
récurrence. L'intention de l'utilisateur disparaît sans message. La page
principale, elle, transmet bien la récurrence : il existe deux copies du même
code de création, et elles ont divergé. Ce plan les fait passer par une seule
fonction pure, testée, pour qu'elles ne puissent plus diverger.

## État actuel

- `features/todos/useTaskMode.ts` — analyse la saisie. Son type de sortie
  (l.23-41) :
  ```ts
  export interface SmartTaskData {
    text: string;
    note?: string;
    dueDate?: Date | null;
    priority?: Priority;
    /** Projet écrit `#nom` (résolu en id par l'appelant). */
    list?: string | null;
    /** Tags écrits `@nom` (résolus en ids par l'appelant). */
    tags?: string[];
    /** Répétition écrite en clair (« chaque lundi »). */
    recurrence?: Recurrence;
    /** Jours nommés d'un hebdomadaire, « mon,thu ». */
    recurWeekdays?: string | null;
    rawText?: string;
    aiPriorityAllowed?: boolean;
  }
  ```
  Le texte qu'il renvoie a **déjà perdu** la phrase de récurrence
  (`useTaskMode.ts:176-179`, `stripRecurrenceFromText`).

- `features/todos/useCaptureTask.ts` — utilisé par la barre rapide
  (`app/quick/page.tsx:131` et `:436-442`) et par l'accueil
  (`components/onboarding/Onboarding.tsx:342`). Le bug est ici
  (l.33-40) : `recurrence` et `recurWeekdays` ne sont jamais transmis.
  ```ts
  const todo = await createTodo({
    text: data.text,
    note: data.note ?? null,
    priority: data.priority ?? "normal",
    scheduled_for: due ?? todayLocalISODate(),
    due_date: null,
    project_id: projectId,
  });
  ```

- `hooks/usePlannerTodos.ts` — `createTodoFromSmart` (l.56-132), utilisé par
  la page principale (`app/(app)/page.tsx:651`). Version correcte du même
  calcul (l.76-100) :
  ```ts
  const payload: CreateTodoInput = {
    text: taskData.text,
    note: taskData.note ?? null,
    priority: taskData.priority ?? "normal",
    scheduled_for: dueDate,
    due_date: null,
    ...(taskData.recurrence && taskData.recurrence !== "none"
      ? {
          recurrence: taskData.recurrence,
          ...(taskData.recurWeekdays
            ? { recur_weekdays: taskData.recurWeekdays }
            : {}),
        }
      : {}),
    ...(dueDate ? {} : options?.whenUndated),
    ...options?.container,
    ...(projectId ? { project_id: projectId, area_id: null } : {}),
  };
  ```
  (`dueDate` y vaut `taskData.dueDate ? toLocalISODate(taskData.dueDate) : null`.)

- `features/todos/types.ts:17-46` — `CreateTodoInput` (champs optionnels,
  dont `recurrence`, `recur_weekdays`, `scheduled_for`, `due_date`,
  `project_id`, `area_id`).
- `lib/date.ts` — `toLocalISODate(date)` (l.6) et `todayLocalISODate()`
  (l.14) ; ce fichier n'importe rien, il est donc utilisable depuis un test.
- **Convention de test** : vitest (`pnpm test`) ne résout pas l'alias `@/` et
  n'inclut que `lib/**/*.test.ts` et `features/**/*.test.ts`. Un module testé
  n'importe qu'en **relatif**, et les imports de types (`import type`) sont
  sans danger (ils disparaissent à l'exécution). Modèle à suivre :
  `features/todos/undo.ts` (logique pure extraite d'un hook) et son test
  `features/todos/undo.test.ts` (`import { describe, it, expect } from "vitest";`).
- **Différence voulue entre les deux chemins** (à conserver) : la barre rapide
  planifie **aujourd'hui** une tâche sans date ; la page principale applique
  les défauts de la vue ouverte (`options.whenUndated`) et du conteneur
  (`options.container`).
- Commentaires et noms en français, comme le reste du dossier.

## Commandes utiles

| But | Commande | Attendu |
|---|---|---|
| Tests ciblés | `pnpm exec vitest run features/todos/capture` | tous passent |
| Tous les tests | `pnpm test` | exit 0 |
| Types | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | « No ESLint warnings or errors » |

## Périmètre

**Dans le périmètre** :
- `features/todos/capture.ts` (créer) — la fonction pure
- `features/todos/capture.test.ts` (créer)
- `features/todos/useCaptureTask.ts` — l'utiliser
- `hooks/usePlannerTodos.ts` — l'utiliser dans `createTodoFromSmart`

**Hors périmètre** :
- `features/todos/useTaskMode.ts` — l'analyse est correcte ; ne pas toucher à
  la manière dont elle retire la récurrence du texte.
- Le toast, la résolution de projet (`#nom`) et la correction IA de priorité
  dans `createTodoFromSmart` — restent où ils sont. Ne pas ajouter la
  correction IA à la barre rapide dans ce plan (choix de produit séparé).
- `src-tauri/**` — le backend accepte déjà `recurrence`/`recur_weekdays`.
- Le mémo « noms de projets actifs triés », recopié en trois endroits : dette
  réelle, mais pas l'objet de ce plan.

## Git

- Branche : `advisor/002-capture-recurrence`
- Commit, style du dépôt :
  `fix(quick): a recurring task captured with Alt+Q stays recurring`
- Ne pas pousser, ne pas ouvrir de PR sauf instruction de l'opérateur.

## Étapes

### Étape 1 : Créer la fonction pure `payloadDeCapture`

Crée `features/todos/capture.ts` :

```ts
import type { CreateTodoInput } from "./types";
import type { SmartTaskData } from "./useTaskMode";
import { toLocalISODate } from "../../lib/date";

/**
 * Ce que l'on écrit en base pour une phrase analysée — le SEUL endroit qui
 * le calcule, pour la page principale comme pour la barre rapide (elles
 * avaient divergé : la barre rapide perdait « chaque lundi »).
 *
 * `projectId` est l'id du `#projet` tapé, déjà résolu par l'appelant.
 * `whenUndated` ne s'applique que si aucune date n'a été reconnue ;
 * `container` s'applique toujours ; un `#projet` tapé prime sur le conteneur.
 */
export function payloadDeCapture(
  data: SmartTaskData,
  projectId: string | null,
  options?: {
    whenUndated?: Partial<CreateTodoInput>;
    container?: Partial<CreateTodoInput>;
  },
): CreateTodoInput {
  const dueDate = data.dueDate ? toLocalISODate(data.dueDate) : null;
  return {
    // … reprendre EXACTEMENT le corps de l'objet `payload` de
    // hooks/usePlannerTodos.ts:76-100 (voir « État actuel »), en remplaçant
    // `taskData` par `data` et `options` par `options`.
  };
}
```

Recopie les commentaires utiles de l'original (« Une date saisie est un
« quand je m'y mets »… », etc.).

**Vérifier** : `pnpm typecheck` → exit 0.

### Étape 2 : Tester la fonction

Crée `features/todos/capture.test.ts` sur le modèle de
`features/todos/undo.test.ts`. Cas à couvrir (un `it` chacun) :

1. `recurrence: "weekly"` + `recurWeekdays: "mon"` → le résultat contient
   `recurrence: "weekly"` et `recur_weekdays: "mon"`.
2. `recurrence: "weekly"` sans `recurWeekdays` → `recurrence: "weekly"` et
   **pas** de clé `recur_weekdays` (`expect("recur_weekdays" in p).toBe(false)`).
3. `recurrence: "none"` → pas de clé `recurrence`.
4. Pas de date + `whenUndated: { scheduled_for: "2026-10-21" }` →
   `scheduled_for: "2026-10-21"`.
5. Une date (`dueDate: new Date(2026, 9, 25)`) + le même `whenUndated` →
   `scheduled_for: "2026-10-25"` (le défaut est ignoré).
6. `projectId: "p1"` + `container: { area_id: "a1" }` → `project_id: "p1"`,
   `area_id: null`.
7. `due_date` vaut toujours `null`.

**Vérifier** : `pnpm exec vitest run features/todos/capture` → 7 tests passent.

### Étape 3 : Brancher la page principale

Dans `hooks/usePlannerTodos.ts`, remplace la construction de `payload`
(l.76-100) par :

```ts
const payload = payloadDeCapture(taskData, projectId, options);
```

et supprime la variable locale `dueDate` si elle n'est plus utilisée
(attention : le toast l.115 lit `payload.scheduled_for`, il reste valable).
Ajoute l'import `import { payloadDeCapture } from "@/features/todos/capture";`
(l'alias `@/` est correct ici : ce hook n'est pas atteint par un test).

**Vérifier** : `pnpm typecheck` → exit 0 ; `pnpm test` → exit 0.

### Étape 4 : Brancher la barre rapide (le correctif)

Dans `features/todos/useCaptureTask.ts`, remplace l'objet passé à
`createTodo` (l.33-40) par :

```ts
const todo = await createTodo(
  payloadDeCapture(data, projectId, {
    // La barre rapide planifie aujourd'hui une tâche sans date.
    whenUndated: { scheduled_for: todayLocalISODate() },
  }),
);
```

Supprime la variable `due` et l'import de `toLocalISODate` s'ils ne servent
plus. Garde `todayLocalISODate`.

**Vérifier** :
- `pnpm typecheck` → exit 0
- `grep -n "recurrence" features/todos/useCaptureTask.ts` → aucune ligne
  (la récurrence passe désormais par `payloadDeCapture`)
- `grep -n "payloadDeCapture" features/todos/useCaptureTask.ts hooks/usePlannerTodos.ts` → une ligne d'appel dans chaque fichier (plus les imports)

### Étape 5 : Vérification d'ensemble

**Vérifier** : `pnpm check` → exit 0 ; `pnpm lint` → « No ESLint warnings or errors ».

## Plan de test

- Nouveau fichier `features/todos/capture.test.ts`, 7 cas (étape 2), modèle
  `features/todos/undo.test.ts`.
- Vérification manuelle facultative (si l'opérateur le demande et que l'app
  peut être lancée avec `pnpm tauri dev`) : Alt+Q → taper
  « Test récurrence chaque lundi » → Entrée → dans la page principale, la
  tâche affiche l'icône de répétition.

## Critères de fin

- [ ] `pnpm check` exit 0, dont 7 nouveaux tests dans `features/todos/capture.test.ts`
- [ ] `pnpm lint` sans avertissement
- [ ] `grep -c "payloadDeCapture(" hooks/usePlannerTodos.ts features/todos/useCaptureTask.ts` → `1` pour chaque fichier
- [ ] `git status --short` ne montre que les 4 fichiers du périmètre (+ `plans/README.md`)
- [ ] La ligne du plan 002 est à jour dans `plans/README.md`

## Conditions d'arrêt

- `useCaptureTask.ts` transmet déjà `recurrence` (le bug a été corrigé
  autrement) : rendre compte.
- Le corps de `payload` dans `usePlannerTodos.ts` ne correspond plus à
  l'extrait : rendre compte au lieu de deviner la bonne version.
- `vitest` échoue à importer `features/todos/capture.ts` à cause d'un import
  transitif (par ex. si `lib/date.ts` a gagné un import `@/`) : rendre compte.
- Un test existant casse et la correction exigerait de modifier un fichier
  hors périmètre.

## Notes de maintenance

- Toute nouvelle façon de créer une tâche depuis une saisie doit passer par
  `payloadDeCapture` ; c'est la raison d'être de ce plan.
- À surveiller en relecture : que la barre rapide garde « aujourd'hui » par
  défaut pour une tâche sans date, et que la page principale garde les défauts
  de vue (`whenUndated`) et de conteneur (`container`).
- Reporté : la correction IA de priorité n'existe que sur la page principale ;
  l'ajouter à la barre rapide est un choix de produit, pas un correctif.
