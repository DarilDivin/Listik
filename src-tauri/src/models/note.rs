use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Note autonome (≠ champ `note` d'une tâche). Contenu en Markdown.
// `created_at`/`updated_at` sont des chaînes ISO, alignées au frontend.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/notes/generated/")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

// Données d'entrée pour créer une note (titre/contenu optionnels → "" par défaut).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct CreateNote {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}

// Mise à jour partielle : seuls les champs fournis sont écrits.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateNote {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub pinned: Option<bool>,
}
