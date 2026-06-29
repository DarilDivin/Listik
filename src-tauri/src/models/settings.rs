use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Réglages applicatifs exposés au frontend (valeurs résolues, avec défauts).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct Settings {
    /// Active le résumé quotidien (notification listant les tâches du jour).
    pub daily_digest_enabled: bool,
    /// Heure d'envoi du résumé, format « HH:MM » (heure locale).
    pub daily_digest_time: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            daily_digest_enabled: false,
            daily_digest_time: "08:00".to_string(),
        }
    }
}

/// Mise à jour partielle des réglages (seuls les champs présents sont écrits).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateSettings {
    #[serde(default)]
    pub daily_digest_enabled: Option<bool>,
    #[serde(default)]
    pub daily_digest_time: Option<String>,
}
