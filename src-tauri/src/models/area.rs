use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Domaine (Area) : grand pilier de vie regroupant des projets, sans date de fin.
// `created_at` est une chaîne ISO, alignée au frontend.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/projects/generated/")]
pub struct Area {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateArea {
    pub name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateArea {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub position: Option<i64>,
}
