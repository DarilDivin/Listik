use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::Priority;

// Résultat de l'extraction LLM d'une tâche en langage naturel (`POST /parse`
// du sidecar). Miroir du `SmartTaskData` Pydantic côté Python.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct AiParsedTask {
    pub text: String,
    pub note: Option<String>,
    pub due_date: Option<String>,
    pub priority: Priority,
    pub list: Option<String>,
}
