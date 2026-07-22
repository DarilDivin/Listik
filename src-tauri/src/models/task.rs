use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Statut d'une tâche. Sérialisé en minuscules pour correspondre
// au schéma SQLite et aux types TypeScript (générés ci-dessous via ts-rs).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[ts(export, export_to = "../../features/todos/generated/")]
pub enum TodoStatus {
    Pending,
    Completed,
    Cancelled,
}

impl TodoStatus {
    /// Bascule pending <-> completed (laisse cancelled inchangé).
    pub fn toggled(self) -> Self {
        match self {
            TodoStatus::Pending => TodoStatus::Completed,
            TodoStatus::Completed => TodoStatus::Pending,
            TodoStatus::Cancelled => TodoStatus::Cancelled,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[ts(export, export_to = "../../features/todos/generated/")]
pub enum Priority {
    Low,
    Normal,
    High,
}

impl Default for Priority {
    fn default() -> Self {
        Priority::Normal
    }
}

// Récurrence d'une tâche. À la complétion, une tâche récurrente est reportée
// à sa prochaine occurrence au lieu d'être marquée terminée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[ts(export, export_to = "../../features/todos/generated/")]
pub enum Recurrence {
    None,
    Daily,
    Weekdays,
    Weekly,
    Monthly,
}

impl Default for Recurrence {
    fn default() -> Self {
        Recurrence::None
    }
}

impl Recurrence {
    /// Prochaine occurrence après `from`, avec les modificateurs par défaut
    /// (intervalle 1, sans positionnel) — conservé pour compatibilité.
    pub fn advance(self, from: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
        RecurrenceRule { recurrence: self, interval: 1, weekday: None, setpos: None }.advance(from)
    }
}

// Jour de semaine d'une règle positionnelle (« le 3e MARDI du mois »).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[ts(export, export_to = "../../features/todos/generated/")]
pub enum RecurWeekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

impl From<RecurWeekday> for chrono::Weekday {
    fn from(w: RecurWeekday) -> Self {
        use chrono::Weekday::*;
        match w {
            RecurWeekday::Mon => Mon,
            RecurWeekday::Tue => Tue,
            RecurWeekday::Wed => Wed,
            RecurWeekday::Thu => Thu,
            RecurWeekday::Fri => Fri,
            RecurWeekday::Sat => Sat,
            RecurWeekday::Sun => Sun,
        }
    }
}

// Base de calcul de la prochaine occurrence : depuis la date planifiée (fixe)
// ou depuis le jour où l'on coche (« 3 semaines après complétion »).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
#[ts(export, export_to = "../../features/todos/generated/")]
pub enum RecurMode {
    Fixed,
    AfterCompletion,
}

impl Default for RecurMode {
    fn default() -> Self {
        RecurMode::Fixed
    }
}

/// Règle de récurrence complète : fréquence + modificateurs.
///
/// Sémantique **strict-après** : `advance(from)` renvoie toujours une date
/// STRICTEMENT postérieure à `from`. C'est la garde essentielle du positionnel —
/// avec `>=`, une tâche « 1er lundi » cochée le 1er lundi se renverrait
/// elle-même et ne bougerait plus jamais.
pub struct RecurrenceRule {
    pub recurrence: Recurrence,
    /// Toutes les N occurrences (jours/semaines/mois). Ignoré pour `Weekdays`
    /// (« un jour ouvré sur deux » ne veut rien dire).
    pub interval: i64,
    /// Avec `setpos` : le Ne jour de semaine du mois (monthly uniquement).
    pub weekday: Option<RecurWeekday>,
    /// 1..4, ou -1 = dernier. Sans `weekday` : -1 = dernier JOUR du mois
    /// (couvre la fin de mois — un ancrage au 31 se borne au 28/30 et n'y
    /// revient jamais, voir `advance`).
    pub setpos: Option<i64>,
}

impl RecurrenceRule {
    pub fn advance(&self, from: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
        use chrono::{Datelike, Duration, Months, Weekday};
        let interval = self.interval.max(1);

        match self.recurrence {
            Recurrence::None => None,
            Recurrence::Daily => Some(from + Duration::days(interval)),
            Recurrence::Weekly => Some(from + Duration::days(7 * interval)),
            Recurrence::Weekdays => {
                // Intervalle volontairement ignoré : « chaque jour ouvré ».
                let mut d = from + Duration::days(1);
                while matches!(d.weekday(), Weekday::Sat | Weekday::Sun) {
                    d += Duration::days(1);
                }
                Some(d)
            }
            Recurrence::Monthly => match self.setpos {
                // Positionnel : strict-après — l'occurrence du mois de `from`
                // si elle est encore à venir, sinon celle du mois + intervalle.
                // (Le premier cas ne joue que si la base est désalignée de la
                // règle : toujours-sauter ferait rater une occurrence.)
                Some(pos) => {
                    if let Some(cand) = Self::positional_in_month(from, self.weekday, pos) {
                        if cand > from {
                            return Some(cand);
                        }
                    }
                    let target = from.checked_add_months(Months::new(interval as u32))?;
                    Self::positional_in_month(target, self.weekday, pos)
                }
                // Mensuel simple : jour d'ancrage, borné en fin de mois par
                // chrono (31 → 28/30). Le jour borné DEVIENT le nouvel ancrage
                // (matérialisation en avant) : documenté, assumé — « fin de
                // mois » s'exprime avec setpos = -1.
                None => from.checked_add_months(Months::new(interval as u32)),
            },
        }
    }

    /// Occurrence positionnelle dans le mois de `anchor` : le Ne `weekday`
    /// (1..4), le dernier `weekday` (-1, calculé depuis la FIN du mois — un
    /// mois compte 4 ou 5 fois chaque jour, « dernier » ≠ « 4e »), ou le
    /// dernier jour du mois (-1 sans weekday).
    fn positional_in_month(
        anchor: chrono::NaiveDate,
        weekday: Option<RecurWeekday>,
        pos: i64,
    ) -> Option<chrono::NaiveDate> {
        use chrono::{Datelike, Duration, NaiveDate};

        let (y, m) = (anchor.year(), anchor.month());
        let first = NaiveDate::from_ymd_opt(y, m, 1)?;
        let last = first
            .checked_add_months(chrono::Months::new(1))?
            .pred_opt()?;

        match weekday {
            Some(wd) => {
                let wd: chrono::Weekday = wd.into();
                if pos == -1 {
                    let mut d = last;
                    while d.weekday() != wd {
                        d -= Duration::days(1);
                    }
                    Some(d)
                } else if (1..=4).contains(&pos) {
                    let mut d = first;
                    while d.weekday() != wd {
                        d += Duration::days(1);
                    }
                    let d = d + Duration::days(7 * (pos - 1));
                    (d.month() == m).then_some(d)
                } else {
                    None
                }
            }
            None if pos == -1 => Some(last),
            None => None,
        }
    }
}

// Représentation d'une tâche telle que stockée/renvoyée.
// Les dates "jour seul" (scheduled_for, due_date) et les timestamps
// sont des chaînes ISO afin de rester alignées au format du frontend.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub note: Option<String>,
    pub list: Option<String>,
    pub status: TodoStatus,
    pub priority: Priority,
    pub recurrence: Recurrence,
    /// Toutes les N occurrences (1 = comportement historique).
    /// `number` côté TS : un entier ≤ 99, le `bigint` par défaut de ts-rs
    /// contaminerait tous les spreads du frontend.
    #[ts(type = "number")]
    pub recur_interval: i64,
    /// Ne jour de semaine du mois (avec `recur_setpos`, monthly uniquement).
    pub recur_weekday: Option<RecurWeekday>,
    /// 1..4, -1 = dernier ; -1 sans weekday = dernier jour du mois.
    #[ts(type = "number | null")]
    pub recur_setpos: Option<i64>,
    /// Base du report : date fixe, ou jour de complétion.
    pub recur_mode: RecurMode,
    pub scheduled_for: Option<String>,
    pub due_date: Option<String>,
    /// Rappel ponctuel : date-heure locale « YYYY-MM-DDTHH:MM » (None = aucun).
    pub remind_at: Option<String>,
    /// Projet de rattachement (Phase E+). NULL tant que non affecté.
    pub project_id: Option<String>,
    /// Domaine de rattachement direct, sans projet intermédiaire (façon Things).
    /// Une tâche dans un projet hérite du domaine de celui-ci : les deux champs
    /// ne sont pas renseignés en même temps.
    pub area_id: Option<String>,
    /// En-tête interne de projet (colonne/étape). NULL en lean (pas d'UI).
    pub heading_id: Option<String>,
    /// « Ce soir » : sous-section de la vue Aujourd'hui.
    pub this_evening: bool,
    /// « Un jour » (Someday) : rangée hors des horizons datés.
    pub someday: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Checklist à un niveau. Absent des colonnes SQL de `todos` (`#[sqlx(skip)]`
    /// → jamais lu depuis la row, `Default::default()`) : peuplé séparément par
    /// `db::attach_relations`.
    #[sqlx(skip)]
    pub sub_tasks: Vec<super::SubTask>,
    /// Tags de la tâche (liaison M-N `task_tags`). Même mécanique que
    /// `sub_tasks` : hors colonnes SQL, peuplé par `db::attach_relations`.
    #[sqlx(skip)]
    pub tags: Vec<super::Tag>,
}

// Données d'entrée pour créer une tâche (envoyées par le frontend).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTodo {
    pub text: String,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub list: Option<String>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
    #[serde(default = "default_interval")]
    pub recur_interval: i64,
    #[serde(default)]
    pub recur_weekday: Option<RecurWeekday>,
    #[serde(default)]
    pub recur_setpos: Option<i64>,
    #[serde(default)]
    pub recur_mode: RecurMode,
    #[serde(default)]
    pub scheduled_for: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub area_id: Option<String>,
    #[serde(default)]
    pub heading_id: Option<String>,
    #[serde(default)]
    pub this_evening: bool,
    #[serde(default)]
    pub someday: bool,
}

fn default_interval() -> i64 {
    1
}

/// Désérialise un champ `Option<Option<T>>` en distinguant l'absence du champ
/// (`None`) d'un `null` explicite (`Some(None)`). Sans ça, serde réduit `null`
/// à `None` et on ne peut pas remettre un champ à NULL via une mise à jour.
/// À combiner avec `#[serde(default)]` (appelé seulement si le champ est présent).
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

// Données d'entrée pour une mise à jour partielle.
// `Option<Option<T>>` distingue "champ absent" de "mettre à null".
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateTodo {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub note: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub list: Option<Option<String>>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
    #[serde(default)]
    pub recur_interval: Option<i64>,
    #[serde(default, deserialize_with = "double_option")]
    pub recur_weekday: Option<Option<RecurWeekday>>,
    #[serde(default, deserialize_with = "double_option")]
    pub recur_setpos: Option<Option<i64>>,
    #[serde(default)]
    pub recur_mode: Option<RecurMode>,
    #[serde(default)]
    pub status: Option<TodoStatus>,
    #[serde(default, deserialize_with = "double_option")]
    pub scheduled_for: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub remind_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub project_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub area_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub heading_id: Option<Option<String>>,
    #[serde(default)]
    pub this_evening: Option<bool>,
    #[serde(default)]
    pub someday: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggled_swaps_pending_and_completed() {
        assert!(matches!(TodoStatus::Pending.toggled(), TodoStatus::Completed));
        assert!(matches!(TodoStatus::Completed.toggled(), TodoStatus::Pending));
    }

    #[test]
    fn toggled_leaves_cancelled_unchanged() {
        assert!(matches!(TodoStatus::Cancelled.toggled(), TodoStatus::Cancelled));
    }

    #[test]
    fn priority_defaults_to_normal() {
        assert!(matches!(Priority::default(), Priority::Normal));
    }

    // ⚠️ Table de parité avec features/todos/recurrence.test.ts : les mêmes
    // cas doivent passer des deux côtés (le miroir JS sert à l'optimiste).
    #[test]
    fn rule_advance_every_n() {
        use chrono::NaiveDate;
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        let rule = |r, i| RecurrenceRule { recurrence: r, interval: i, weekday: None, setpos: None };

        // Toutes les 2 semaines / tous les 3 jours / tous les 2 mois.
        assert_eq!(rule(Recurrence::Weekly, 2).advance(d("2026-06-14")), Some(d("2026-06-28")));
        assert_eq!(rule(Recurrence::Daily, 3).advance(d("2026-06-14")), Some(d("2026-06-17")));
        assert_eq!(rule(Recurrence::Monthly, 2).advance(d("2026-06-14")), Some(d("2026-08-14")));

        // Fin de mois : chrono borne (31 janv + 1 mois = 28 févr), et le jour
        // borné devient le nouvel ancrage — documenté, « fin de mois » = setpos -1.
        assert_eq!(rule(Recurrence::Monthly, 1).advance(d("2026-01-31")), Some(d("2026-02-28")));

        // Jours ouvrés : l'intervalle est ignoré (pas de « un ouvré sur deux »).
        let wd = RecurrenceRule { recurrence: Recurrence::Weekdays, interval: 5, weekday: None, setpos: None };
        assert_eq!(wd.advance(d("2026-06-12")), Some(d("2026-06-15"))); // ven → lun
    }

    #[test]
    fn rule_advance_nth_weekday_is_strictly_after() {
        use chrono::NaiveDate;
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        let first_monday = RecurrenceRule {
            recurrence: Recurrence::Monthly,
            interval: 1,
            weekday: Some(RecurWeekday::Mon),
            setpos: Some(1),
        };

        // 2026-06-01 est un lundi (le 1er lundi de juin). Cocher CE jour-là
        // doit sauter au 1er lundi de juillet — avec `>=`, la tâche se
        // renverrait elle-même et ne bougerait plus jamais.
        assert_eq!(first_monday.advance(d("2026-06-01")), Some(d("2026-07-06")));

        // Base désalignée AVANT l'occurrence du mois : on la rattrape (ne pas
        // sauter une occurrence).
        assert_eq!(first_monday.advance(d("2026-07-02")), Some(d("2026-07-06")));
        // Base après l'occurrence du mois : mois suivant.
        assert_eq!(first_monday.advance(d("2026-07-10")), Some(d("2026-08-03")));
    }

    #[test]
    fn rule_advance_last_weekday_and_last_day() {
        use chrono::NaiveDate;
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();

        // « Dernier vendredi » ≠ « 4e vendredi » : juillet 2026 en a 5 (le 31).
        let last_friday = RecurrenceRule {
            recurrence: Recurrence::Monthly,
            interval: 1,
            weekday: Some(RecurWeekday::Fri),
            setpos: Some(-1),
        };
        assert_eq!(last_friday.advance(d("2026-06-26")), Some(d("2026-07-31")));

        // « Dernier jour du mois » (setpos -1 sans weekday) : ne dérive jamais,
        // contrairement à un ancrage au 31. Février bissextile inclus.
        let last_day = RecurrenceRule {
            recurrence: Recurrence::Monthly,
            interval: 1,
            weekday: None,
            setpos: Some(-1),
        };
        assert_eq!(last_day.advance(d("2026-01-31")), Some(d("2026-02-28")));
        assert_eq!(last_day.advance(d("2026-02-28")), Some(d("2026-03-31")));
        assert_eq!(last_day.advance(d("2028-01-31")), Some(d("2028-02-29"))); // bissextile
    }

    #[test]
    fn recurrence_advance_computes_next_occurrence() {
        use chrono::NaiveDate;
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();

        // dimanche 2026-06-14
        assert_eq!(Recurrence::None.advance(d("2026-06-14")), None);
        assert_eq!(Recurrence::Daily.advance(d("2026-06-14")), Some(d("2026-06-15")));
        assert_eq!(Recurrence::Weekly.advance(d("2026-06-14")), Some(d("2026-06-21")));
        assert_eq!(Recurrence::Monthly.advance(d("2026-06-14")), Some(d("2026-07-14")));

        // jours ouvrés : vendredi → lundi
        assert_eq!(Recurrence::Weekdays.advance(d("2026-06-12")), Some(d("2026-06-15")));
        // jours ouvrés : mardi → mercredi
        assert_eq!(Recurrence::Weekdays.advance(d("2026-06-16")), Some(d("2026-06-17")));
    }

    #[test]
    fn update_distinguishes_absent_field_from_explicit_null() {
        // Champ absent → None (ne pas toucher).
        let absent: UpdateTodo = serde_json::from_str("{}").unwrap();
        assert!(matches!(absent.note, None));

        // null explicite → Some(None) (mettre à NULL).
        let cleared: UpdateTodo = serde_json::from_str(r#"{"note": null}"#).unwrap();
        assert!(matches!(cleared.note, Some(None)));

        // Valeur → Some(Some(_)).
        let set: UpdateTodo = serde_json::from_str(r#"{"note": "coucou"}"#).unwrap();
        assert!(matches!(set.note, Some(Some(ref s)) if s == "coucou"));

        // Vaut aussi pour les dates.
        let cleared_date: UpdateTodo =
            serde_json::from_str(r#"{"scheduled_for": null}"#).unwrap();
        assert!(matches!(cleared_date.scheduled_for, Some(None)));
    }
}
