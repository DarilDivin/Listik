use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Sous-tâche : checklist à un seul niveau (pas de sous-sous-tâches).
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct SubTask {
    pub id: String,
    pub todo_id: String,
    pub text: String,
    pub done: bool,
    pub position: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSubTask {
    pub todo_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateSubTask {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub done: Option<bool>,
}
