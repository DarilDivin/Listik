use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Tag transverse. `parent_id` présent pour l'imbrication future (sans UI en lean).
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/tags/generated/")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTag {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateTag {
    #[serde(default)]
    pub name: Option<String>,
}
