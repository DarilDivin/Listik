use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Un bloc horodaté du Journal (Phase P, remplace les Notes). `target_day`
/// (YYYY-MM-DD) est le jour d'appartenance de la page ; `written_at` (ISO) est
/// le moment d'écriture réel — distincts pour une entrée écrite en avance
/// (« pour plus tard ») : `target_day` peut être dans le futur, `written_at`
/// reste la date d'écriture.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/journal/generated/")]
pub struct JournalEntry {
    pub id: String,
    pub target_day: String,
    pub written_at: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    /// Tags du bloc (liaison M-N `journal_entry_tags`). Hors colonnes SQL,
    /// peuplé séparément par `db::attach_journal_relations` — même mécanique
    /// que `Todo::tags`.
    #[sqlx(skip)]
    pub tags: Vec<super::Tag>,
}

// Données d'entrée pour créer un bloc. `target_day` est TOUJOURS fourni par
// le frontend (résolu via `todayLocalISODate()`/le sélecteur de date, jamais
// côté serveur) — le calendrier journal, comme `scheduled_for` des tâches,
// raisonne en jour LOCAL, que `chrono::Utc::now()` ne peut pas fournir sans
// risque de décalage. `written_at`, lui, est toujours résolu côté serveur.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateJournalEntry {
    pub target_day: String,
    pub content: String,
}

// Mise à jour partielle : seuls les champs fournis sont écrits.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateJournalEntry {
    #[serde(default)]
    pub target_day: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}
