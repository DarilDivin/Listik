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
    /// Prochaine occurrence après `from` (None si pas de récurrence).
    pub fn advance(self, from: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
        use chrono::{Datelike, Duration, Months, Weekday};
        match self {
            Recurrence::None => None,
            Recurrence::Daily => Some(from + Duration::days(1)),
            Recurrence::Weekly => Some(from + Duration::days(7)),
            Recurrence::Monthly => from.checked_add_months(Months::new(1)),
            Recurrence::Weekdays => {
                let mut d = from + Duration::days(1);
                while matches!(d.weekday(), Weekday::Sat | Weekday::Sun) {
                    d += Duration::days(1);
                }
                Some(d)
            }
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
    pub scheduled_for: Option<String>,
    pub due_date: Option<String>,
    /// Rappel ponctuel : date-heure locale « YYYY-MM-DDTHH:MM » (None = aucun).
    pub remind_at: Option<String>,
    /// Projet de rattachement (Phase E+). NULL tant que non affecté / avant la
    /// réconciliation `list → projets` faite en Phase G.
    pub project_id: Option<String>,
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
    /// `db::attach_subtasks`.
    #[sqlx(skip)]
    pub sub_tasks: Vec<super::SubTask>,
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
    #[serde(default)]
    pub scheduled_for: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub heading_id: Option<String>,
    #[serde(default)]
    pub this_evening: bool,
    #[serde(default)]
    pub someday: bool,
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
