use super::serde::double_option;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Statut d'un projet : actif ou achevé. Sérialisé en minuscules (schéma + TS).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[ts(export, export_to = "../../features/projects/generated/")]
pub enum ProjectStatus {
    Active,
    Completed,
}

impl Default for ProjectStatus {
    fn default() -> Self {
        ProjectStatus::Active
    }
}

// Projet : conteneur concret, éventuellement rattaché à un domaine, avec sa
// propre note et sa deadline (distincte du `due_date` d'une tâche).
// Dates/timestamps en chaînes ISO, alignées au frontend.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/projects/generated/")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub note: Option<String>,
    pub area_id: Option<String>,
    pub status: ProjectStatus,
    /// Deadline « jour seul » du projet (« YYYY-MM-DD »), ou None.
    pub deadline: Option<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProject {
    pub name: String,
    #[serde(default)]
    pub area_id: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub deadline: Option<String>,
}

// Mise à jour partielle. `note`/`area_id`/`deadline` en `Option<Option<T>>`
// pour pouvoir les remettre à NULL explicitement.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateProject {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub note: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub area_id: Option<Option<String>>,
    #[serde(default)]
    pub status: Option<ProjectStatus>,
    #[serde(default, deserialize_with = "double_option")]
    pub deadline: Option<Option<String>>,
    #[serde(default)]
    pub position: Option<i64>,
}
