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

// --- Agent (D4) ---------------------------------------------------------

// Élément retrouvé par la recherche sémantique, cité en source d'une réponse.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct AiSource {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    pub score: f32,
}

// Réponse renvoyée au frontend après un tour d'agent : le message à afficher,
// l'outil que le LLM a choisi (pour l'UI) et les sources éventuelles.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct AiAgentResponse {
    pub message: String,
    pub tool: String,
    pub sources: Vec<AiSource>,
}

// Brouillon de note proposé par l'agent (non exporté : interne au dispatch Rust).
#[derive(Debug, Clone, Deserialize)]
pub struct AiNoteDraft {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
}

// Réponse brute du sidecar `POST /agent`, avant exécution côté Rust.
#[derive(Debug, Clone, Deserialize)]
pub struct SidecarAgentResponse {
    pub tool: String,
    pub message: String,
    pub task: Option<AiParsedTask>,
    pub note: Option<AiNoteDraft>,
    #[serde(default)]
    pub sources: Vec<AiSource>,
}
