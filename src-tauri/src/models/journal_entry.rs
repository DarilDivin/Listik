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

/// Une pièce jointe du journal — une photo aujourd'hui, un document ou une
/// note vocale ensuite.
///
/// `chemin` est le chemin ABSOLU sur le disque : le webview en fait une URL
/// avec `convertFileSrc`. On ne renvoie pas les octets — une photo de trois
/// méga-octets traverserait l'IPC en base64 à chaque rendu.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../features/journal/generated/")]
pub struct JournalPiece {
    pub id: String,
    pub kind: String,
    pub nom_origine: String,
    pub chemin: String,
    pub created_at: String,
}

/// Ce qu'un export a produit, pour pouvoir le dire.
///
/// « Enregistré » ne prouve rien : c'est le nombre de jours et de photos
/// sorties qui dit si le fichier contient bien ce qu'on croit.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../features/journal/generated/")]
pub struct JournalExport {
    pub jours: u32,
    pub pieces: u32,
}

/// Un passage trouvé par la recherche.
///
/// On ne remonte PAS le bloc entier : une reprise peut faire vingt lignes, et
/// une liste de résultats qui les affiche toutes n'est plus une liste, c'est
/// la page. `extrait` est le fragment rendu par FTS5 autour du mot cherché,
/// les occurrences encadrées par `MARQUE_DEBUT`/`MARQUE_FIN` — au front de
/// décider comment il les met en valeur.
#[derive(Debug, Clone, Serialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/journal/generated/")]
pub struct JournalHit {
    pub id: String,
    pub target_day: String,
    pub written_at: String,
    pub extrait: String,
}

/// Densité d'écriture d'UN jour. Sert au calendrier du mois : on ne
/// remonte pas les blocs eux-mêmes pour savoir s'il y en a — trente jours de
/// contenu pour dessiner trente points serait absurde.
#[derive(Debug, Clone, Serialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../features/journal/generated/")]
pub struct JournalDayCount {
    pub day: String,
    pub count: i64,
}

// Données d'entrée pour créer un bloc. `target_day` est TOUJOURS fourni par
// le frontend (résolu via `todayLocalISODate()`/le sélecteur de date, jamais
// côté serveur) — le calendrier journal, comme `scheduled_for` des tâches,
// raisonne en jour LOCAL, que `chrono::Utc::now()` ne peut pas fournir sans
// risque de décalage.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateJournalEntry {
    pub target_day: String,
    pub content: String,
    /// Moment d'écriture. Résolu côté serveur quand il est absent — c'est le
    /// cas normal.
    ///
    /// Fourni dans un seul cas : la SCISSION d'un bloc existant. Le texte qui
    /// suit le curseur n'est pas une écriture nouvelle, c'est la moitié d'un
    /// passage déjà écrit : il hérite donc de l'heure de son origine. Sans
    /// ça, couper le bloc de 8 h à 14 h enverrait sa seconde moitié en bas de
    /// la page, à 14 h, séparée de sa première.
    #[serde(default)]
    pub written_at: Option<String>,
}

// Mise à jour partielle : seuls les champs fournis sont écrits.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateJournalEntry {
    #[serde(default)]
    pub target_day: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}
