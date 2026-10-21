# Plan 004 : « Demain » suit le vrai jour, et un rappel déjà passé ne sonne plus une seconde fois

> **Instructions pour l'exécutant** : suis ce plan étape par étape. Lance
> chaque commande de vérification et confirme le résultat attendu avant de
> passer à l'étape suivante. Si une des « Conditions d'arrêt » se produit,
> arrête-toi et rends compte — n'improvise pas. À la fin, mets à jour la ligne
> de ce plan dans `plans/README.md` — sauf si un relecteur t'a dit qu'il tient
> l'index lui-même.
>
> **Contrôle de dérive (à lancer d'abord)** :
> `git diff --stat 7a99d0f..HEAD -- "app/(app)/page.tsx" lib/date.ts lib/date.test.ts src-tauri/src/db.rs src-tauri/src/commands.rs`
> Le plan 003 modifie aussi `src-tauri/src/commands.rs` (une autre partie de
> `restore_backup`) : un changement venant de lui est attendu. Pour tout autre
> écart avec les extraits de « État actuel », c'est une condition d'arrêt.

## Statut

- **Priorité** : P1
- **Effort** : S
- **Risque** : LOW
- **Dépend de** : `plans/003-restauration-types-de-pieces.md` (même fonction
  `restore_backup` modifiée — à faire après pour éviter un conflit)
- **Catégorie** : bug
- **Planifié à** : commit `7a99d0f`, 2026-10-21

## Pourquoi c'est important

Listik reste ouvert des jours entiers (il vit dans la zone de notification).
Deux défauts de temps en découlent :

1. **« Demain » est figé** au moment où la page principale s'est ouverte.
   Après un minuit, l'action « Demain », le glisser-déposer vers « À venir » et
   la capture dans « À venir » planifient… aujourd'hui ; après deux minuits,
   dans le passé (la tâche tombe dans « En retard »).
2. **Des rappels déjà envoyés sonnent à nouveau** : toute écriture de l'heure
   de rappel la « réarme », même quand cette heure est passée. Cela arrive
   après « Annuler » (qui réécrit l'ancienne heure), après avoir coché une
   tâche répétitive en retard (le rappel décalé reste dans le passé), et après
   une restauration de sauvegarde (tous les anciens rappels repartent).

Après ce plan, la page suit le jour réel, et un rappel dont l'heure est passée
au moment où on l'écrit est considéré comme déjà envoyé.

## État actuel

### Front : « Demain » figé

`app/(app)/page.tsx:263-268` :
```tsx
const todayISO = todayLocalISODate();
const tomorrowISO = useMemo(() => {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toLocalISODate(t);
}, []);
```
`todayISO` est recalculé à chaque rendu, mais rien ne force un rendu à minuit ;
`tomorrowISO` ne change jamais. Les deux sont utilisés aux lignes 281, 291,
308, 317, 319, 393, 400, 494, 637, 639 (regroupement, pouls du jour, actions,
glisser-déposer, défauts de capture).

`lib/date.ts` exporte `toLocalISODate(date)` (l.6) et `todayLocalISODate()`
(l.14) ; il n'importe rien. Son test : `lib/date.test.ts`
(`import { describe, it, expect } from "vitest";`, des `describe` par
fonction, phrases en français).

Les hooks du projet vivent dans `hooks/` (ex. `hooks/useTags.ts`,
`hooks/useWindowActions.ts`), en TypeScript, commentaires en français.

### Rust : réarmement des rappels

Format d'un rappel : date-heure **locale** `YYYY-MM-DDTHH:MM`, comparée comme
du texte. La vérification toutes les 10 s (`src-tauri/src/reminders.rs:52`)
fait `now.format("%Y-%m-%dT%H:%M")` puis `db::due_reminders(pool, &now_str)`
(`src-tauri/src/db.rs:634-644`) :
```sql
WHERE remind_at IS NOT NULL AND reminded = 0 AND status = 'pending' AND remind_at <= ?
```

Écriture d'un rappel par `db::update`, `src-tauri/src/db.rs:499-503`
(`input.remind_at` est un `Option<Option<String>>` : `None` = inchangé,
`Some(None)` = effacé) :
```rust
if let Some(remind_at) = input.remind_at {
    // Le rappel change → on réarme la notification (reminded remis à 0).
    sep.push("remind_at = ").push_bind_unseparated(remind_at);
    sep.push("reminded = ").push_bind_unseparated(0_i64);
}
```

Cocher une tâche répétitive (`db::toggle`), `src-tauri/src/db.rs:569-594` :
le rappel est décalé du même écart que la date (`next_remind`), puis
```rust
sqlx::query(
    "UPDATE todos SET scheduled_for = ?, due_date = ?, remind_at = ?, reminded = 0, \
     needs_embedding = 1, updated_at = ? WHERE id = ?",
)
.bind(&next_str)
.bind(&next_due)
.bind(&next_remind)
.bind(now_iso())
.bind(id)
```
En mode « date fixe », une tâche en retard de plusieurs périodes reçoit un
`next_remind` encore dans le passé : il sonne aussitôt.

Restauration, `src-tauri/src/commands.rs:1042-1060` : la boucle
`for todo in &backup.todos { … }` insère les tâches **sans** la colonne
`reminded`, qui prend sa valeur par défaut `0`
(`src-tauri/migrations/0004_add_reminders.sql:4`). La boucle suivante commence
par `for ordering in &backup.orderings {` (l.1061).

Tests existants (dans `mod tests` de `db.rs`), modèles à suivre :
- `due_reminders_returns_only_past_unsent_pending` (`db.rs:2638`)
- `update_remind_at_rearms_the_reminder` (`db.rs:2665-2694`) — **utilise des
  dates fixes de juin 2026, déjà passées** : avec la nouvelle règle, il faut le
  réécrire avec des heures relatives à maintenant (étape 4).
- `toggle_shifts_deadline_by_the_same_delta_and_never_invents_one`
  (`db.rs:2726`) pour créer une tâche répétitive (`new_todo`, `create`,
  `toggle`, `memory_pool`).

## Commandes utiles

| But | Commande | Attendu |
|---|---|---|
| Tests front ciblés | `pnpm exec vitest run lib/date` | tous passent |
| Front complet | `pnpm check` | exit 0 |
| Lint | `pnpm lint` | « No ESLint warnings or errors » |
| Tests Rust ciblés | `cd src-tauri && cargo test remind` | tous passent |
| Tests Rust | `cd src-tauri && cargo test` | tout passe |

`cargo test` régénère `features/*/generated/` ; ce plan ne change aucun
modèle, ces fichiers ne doivent pas bouger.

## Périmètre

**Dans le périmètre** :
- `lib/date.ts`, `lib/date.test.ts`
- `hooks/useJourCourant.ts` (créer)
- `app/(app)/page.tsx` (lignes 263-268 seulement)
- `src-tauri/src/db.rs` (`update`, `toggle`, deux fonctions utilitaires, tests)
- `src-tauri/src/commands.rs` (une requête dans `restore_backup`)

**Hors périmètre** :
- `src-tauri/src/reminders.rs` — la boucle d'envoi est correcte.
- `features/todos/undo.ts` — « Annuler » réécrit l'ancienne heure ; c'est la
  règle côté Rust qui le rend inoffensif.
- La création (`db::create`) et la duplication (qui remet `remind_at` à NULL) :
  inchangées.
- Les autres usages de « aujourd'hui » dans l'app (journal, widget, barre
  rapide) : un autre plan s'occupe du journal.
- `components/todo/TodoDate.tsx` (affichage d'une date en UTC) : défaut
  distinct, non traité ici.

## Git

- Branche : `advisor/004-dates-rappels`
- Deux commits, style du dépôt :
  - `fix(planner): "tomorrow" follows the real day after midnight`
  - `fix(reminders): a reminder already past is not sent a second time`
- Ne pas pousser, ne pas ouvrir de PR sauf instruction de l'opérateur.

## Étapes

### Étape 1 : Deux fonctions de date pures, testées

Dans `lib/date.ts`, ajoute :

```ts
/** Le jour qui suit `iso` (YYYY-MM-DD), en date locale. */
export function lendemainISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toLocalISODate(new Date(y, m - 1, d + 1));
}

/** Millisecondes jusqu'au prochain minuit local, vu depuis `maintenant`. */
export function msAvantMinuit(maintenant: Date): number {
  const minuit = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate() + 1,
  );
  return minuit.getTime() - maintenant.getTime();
}
```

Dans `lib/date.test.ts`, ajoute deux `describe` :
- `lendemainISO` : `"2026-10-21"` → `"2026-10-22"` ; `"2026-10-31"` →
  `"2026-11-01"` ; `"2026-12-31"` → `"2027-01-01"` ; `"2028-02-28"` →
  `"2028-02-29"` (année bissextile) ; `"2026-03-28"` → `"2026-03-29"`
  (veille de changement d'heure en Europe).
- `msAvantMinuit` : `new Date(2026, 9, 21, 23, 59, 0)` → `60_000` ;
  `new Date(2026, 9, 21, 0, 0, 0)` → `86_400_000`.

**Vérifier** : `pnpm exec vitest run lib/date` → tous passent (les anciens et
les nouveaux).

### Étape 2 : Un hook qui suit le jour courant

Crée `hooks/useJourCourant.ts` :

```ts
"use client";

import { useEffect, useState } from "react";
import { lendemainISO, msAvantMinuit, todayLocalISODate } from "@/lib/date";

/**
 * Le jour courant ET le lendemain, qui changent à minuit.
 *
 * Listik reste ouvert des jours entiers : calculé une fois au montage,
 * « demain » devenait aujourd'hui, puis hier. Un minuteur réveille la page à
 * minuit ; le retour au premier plan revérifie aussi (une machine en veille
 * ne réveille pas les minuteurs à l'heure).
 */
export function useJourCourant(): { aujourdhui: string; demain: string } {
  const [aujourdhui, setAujourdhui] = useState(todayLocalISODate);

  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout>;
    const relire = () => setAujourdhui(todayLocalISODate());
    const armer = () => {
      minuteur = setTimeout(() => {
        relire();
        armer();
      }, msAvantMinuit(new Date()) + 1_000);
    };
    armer();
    window.addEventListener("focus", relire);
    document.addEventListener("visibilitychange", relire);
    return () => {
      clearTimeout(minuteur);
      window.removeEventListener("focus", relire);
      document.removeEventListener("visibilitychange", relire);
    };
  }, []);

  return { aujourdhui, demain: lendemainISO(aujourdhui) };
}
```

(`setAujourdhui` avec la même chaîne ne provoque pas de rendu : React ignore
une valeur identique.)

**Vérifier** : `pnpm typecheck` → exit 0.

### Étape 3 : L'utiliser dans la page principale

Dans `app/(app)/page.tsx`, remplace les lignes 263-268 (citées dans « État
actuel ») par :

```tsx
// Suit le vrai jour : la page reste montée des jours entiers.
const { aujourdhui: todayISO, demain: tomorrowISO } = useJourCourant();
```

Ajoute `import { useJourCourant } from "@/hooks/useJourCourant";`. Retire les
imports de `todayLocalISODate` / `toLocalISODate` / `useMemo` **seulement**
s'ils ne servent plus ailleurs dans le fichier (vérifie avec `grep`).

**Vérifier** :
- `pnpm typecheck` → exit 0
- `pnpm lint` → « No ESLint warnings or errors »
- `grep -n "tomorrowISO = " "app/(app)/page.tsx"` → aucune ligne.

Commit 1.

### Étape 4 : La règle « un rappel passé ne se réarme pas », côté Rust

Dans `src-tauri/src/db.rs`, à côté de `due_reminders` (l.631), ajoute :

```rust
/// L'heure présente au format des rappels (« YYYY-MM-DDTHH:MM », locale) —
/// le même que la boucle d'envoi (`reminders.rs`).
pub fn heure_de_rappel_maintenant() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// La valeur de `reminded` pour un rappel qu'on écrit : un rappel dont
/// l'heure est déjà passée compte comme envoyé. Sans ça, « Annuler », cocher
/// une répétitive en retard ou restaurer une sauvegarde faisaient sonner à
/// nouveau des rappels d'hier. L'heure présente (même minute) sonne encore.
fn reminded_pour(remind_at: Option<&str>, maintenant: &str) -> i64 {
    match remind_at {
        Some(heure) if heure < maintenant => 1,
        _ => 0,
    }
}
```

Puis :

1. Dans `update` (l.499-503), remplace le bloc par :
   ```rust
   if let Some(remind_at) = input.remind_at {
       // Le rappel change → on le réarme, sauf s'il est déjà passé.
       let reminded = reminded_pour(remind_at.as_deref(), &heure_de_rappel_maintenant());
       sep.push("remind_at = ").push_bind_unseparated(remind_at);
       sep.push("reminded = ").push_bind_unseparated(reminded);
   }
   ```
2. Dans `toggle` (l.583-594), remplace `reminded = 0` par `reminded = ?` dans
   la requête, et ajoute le `.bind(...)` correspondant **à la bonne place**
   (juste après `.bind(&next_remind)`) :
   ```rust
   .bind(reminded_pour(next_remind.as_deref(), &heure_de_rappel_maintenant()))
   ```

**Vérifier** : `cd src-tauri && cargo build` → compile.

### Étape 5 : Tests Rust

Dans `mod tests` de `db.rs`. Ce module importe ses fonctions par une liste
explicite (`use super::{ create, …, update, … };`, vers `db.rs:2392-2398`) :
ajoute-y `heure_de_rappel_maintenant` et `reminded_pour`.

1. **Réécris** `update_remind_at_rearms_the_reminder` avec des heures
   relatives à maintenant. Calcule en tête :
   ```rust
   let fmt = |d: chrono::DateTime<chrono::Local>| d.format("%Y-%m-%dT%H:%M").to_string();
   let maintenant = chrono::Local::now();
   let dans_1h = fmt(maintenant + chrono::Duration::hours(1));
   let dans_2h = fmt(maintenant + chrono::Duration::hours(2));
   let dans_3h = fmt(maintenant + chrono::Duration::hours(3));
   ```
   Crée la tâche avec `remind_at = dans_1h`, vérifie que
   `due_reminders(&pool, &dans_3h)` en rend 1, `mark_reminded`, vérifie qu'il
   n'en rend plus aucun, puis `update` avec `remind_at = Some(Some(dans_2h))`
   et vérifie que `due_reminders(&pool, &dans_3h)` en rend de nouveau 1.
2. **Ajoute** `update_remind_at_in_the_past_does_not_rearm` : tâche avec
   rappel `dans_1h`, `mark_reminded`, puis `update` avec un rappel
   `fmt(maintenant - chrono::Duration::hours(2))` → `due_reminders(&pool, &dans_3h)`
   est vide.
3. **Ajoute** `toggle_of_an_overdue_recurring_task_does_not_resend_its_reminder` :
   tâche avec `input.recurrence = Some(Recurrence::Daily)` (mode « fixe » par
   défaut), `scheduled_for` = il y a 10 jours
   (`(chrono::Local::now().date_naive() - chrono::Duration::days(10)).format("%Y-%m-%d")`),
   `remind_at` = ce jour-là à `08:00`, `mark_reminded`, puis `toggle` → le
   rappel décalé est encore passé, donc
   `due_reminders(&pool, &heure_de_rappel_maintenant())` est vide.
   (Vérifie d'abord l'énumération : `use crate::models::Recurrence;` comme dans
   `toggle_shifts_deadline_by_the_same_delta_and_never_invents_one`.)
4. **Ajoute** un test pur `reminded_pour_compare_a_maintenant` :
   `reminded_pour(Some("2026-10-21T08:00"), "2026-10-21T09:00") == 1`,
   `reminded_pour(Some("2026-10-21T09:00"), "2026-10-21T09:00") == 0`,
   `reminded_pour(Some("2026-10-21T10:00"), "2026-10-21T09:00") == 0`,
   `reminded_pour(None, "2026-10-21T09:00") == 0`.

**Vérifier** : `cd src-tauri && cargo test remind` → tous passent ;
`cd src-tauri && cargo test toggle` → tous passent.

### Étape 6 : La restauration ne relance pas les anciens rappels

Dans `src-tauri/src/commands.rs`, fonction `restore_backup`, **juste après**
la fin de la boucle `for todo in &backup.todos { … }` et **avant**
`for ordering in &backup.orderings {`, ajoute :

```rust
// Les rappels déjà passés sont réputés envoyés : sans ça, chaque ancien rappel
// d'une tâche encore à faire sonnait dans les dix secondes suivant la
// restauration (la colonne `reminded` n'est pas dans la sauvegarde).
sqlx::query("UPDATE todos SET reminded = 1 WHERE remind_at IS NOT NULL AND remind_at < ?")
    .bind(db::heure_de_rappel_maintenant())
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
```

**Vérifier** : `cd src-tauri && cargo build` → compile ;
`cd src-tauri && cargo test` → tout passe.

Commit 2.

## Plan de test

- `lib/date.test.ts` : `lendemainISO` (5 cas) et `msAvantMinuit` (2 cas).
- `db.rs` : un test réécrit, trois ajoutés (étape 5).
- La restauration (`restore_backup`) n'est pas testable automatiquement (elle
  exige l'application Tauri) : le relecteur vérifie que la requête est dans la
  transaction (`&mut *tx`) et placée après l'insertion des tâches.
- Le hook `useJourCourant` n'est pas testé automatiquement (pas d'environnement
  React dans vitest) : la logique testée est dans `lib/date.ts`.

## Critères de fin

- [ ] `pnpm check` exit 0 ; `pnpm lint` sans avertissement
- [ ] `cd src-tauri && cargo test` → tout passe, dont 3 nouveaux tests et 1 réécrit
- [ ] `grep -n "reminded = 0" src-tauri/src/db.rs` → plus aucune ligne dans `update`/`toggle` (une ligne restante ailleurs est à justifier)
- [ ] `grep -n "tomorrowISO = useMemo" "app/(app)/page.tsx"` → aucune ligne
- [ ] `git status --short` : seulement les fichiers du périmètre (+ `plans/README.md`), aucun fichier de `features/*/generated/`
- [ ] La ligne du plan 004 est à jour dans `plans/README.md`

## Conditions d'arrêt

- Les extraits ne correspondent plus (`update`, `toggle`, la page) : rendre compte.
- Un test existant autre que `update_remind_at_rearms_the_reminder` casse à
  cause de la nouvelle règle (cela voudrait dire qu'un comportement attendu
  repose sur le réarmement d'un rappel passé) : rendre compte, ne pas
  l'adapter.
- `due_reminders` ou le format `YYYY-MM-DDTHH:MM` a changé : rendre compte.

## Notes de maintenance

- Effet voulu à connaître : un utilisateur qui choisit volontairement une
  heure de rappel déjà passée n'est plus notifié. C'était le comportement
  implicite d'avant (notification immédiate), jamais documenté.
- Toute nouvelle écriture de `remind_at` (outil de l'assistant, import…) doit
  passer par `reminded_pour`.
- Reporté : faire avancer un rappel répétitif jusqu'à la prochaine occurrence
  **future** (au lieu de le marquer envoyé) serait plus riche, mais change la
  règle de récurrence partagée avec le front (`features/todos/recurrence.ts`).
