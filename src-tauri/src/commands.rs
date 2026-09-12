use crate::db::{self, AppState};
use crate::models::{
    AiChatMessage, AiParsedTask, Area, CreateArea, CreateJournalEntry, CreateNote, CreateProject,
    CreateSubTask, CreateTag, CreateTodo, JournalDayCount, JournalEntry, JournalExport, JournalHit,
    JournalPiece, Note,
    Project, Settings,
    SubTask, Tag,
    Todo, UpdateArea, UpdateJournalEntry, UpdateNote, UpdateProject, UpdateSettings, UpdateSubTask,
    UpdateTag, UpdateTodo,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Événement diffusé à toutes les fenêtres après une mutation,
/// afin qu'elles revalident leur cache (synchro multi-fenêtres).
pub const TODOS_CHANGED: &str = "todos:changed";

fn notify_changed(app: &AppHandle) {
    if let Err(e) = app.emit(TODOS_CHANGED, ()) {
        eprintln!("⚠️ Émission '{TODOS_CHANGED}' échouée: {e}");
    }
}

// ---------------------------------------------------------------------------
// Commandes Todo (l'accès SQL vit côté Rust, plus dans le webview)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_todos(state: State<'_, AppState>) -> Result<Vec<Todo>, String> {
    db::list_all(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_todos_by_date(
    state: State<'_, AppState>,
    date: String,
) -> Result<Vec<Todo>, String> {
    db::list_by_date(&state.pool, &date)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateTodo,
) -> Result<Todo, String> {
    let todo = db::create(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(todo)
}

#[tauri::command]
pub async fn update_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateTodo,
) -> Result<Todo, String> {
    let todo = db::update(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(todo)
}

#[tauri::command]
pub async fn toggle_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Todo, String> {
    let todo = db::toggle(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(todo)
}

#[tauri::command]
pub async fn delete_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Commandes réglages
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    db::get_settings(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    payload: UpdateSettings,
) -> Result<Settings, String> {
    db::update_settings(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Commandes Notes
// ---------------------------------------------------------------------------

/// Événement diffusé après une mutation de note (synchro multi-vues).
pub const NOTES_CHANGED: &str = "notes:changed";

fn notify_notes_changed(app: &AppHandle) {
    if let Err(e) = app.emit(NOTES_CHANGED, ()) {
        eprintln!("⚠️ Émission '{NOTES_CHANGED}' échouée: {e}");
    }
}

#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    db::list_notes(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_notes(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Note>, String> {
    db::search_notes(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_note(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateNote,
) -> Result<Note, String> {
    let note = db::create_note(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_notes_changed(&app);
    Ok(note)
}

#[tauri::command]
pub async fn update_note(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateNote,
) -> Result<Note, String> {
    let note = db::update_note(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_notes_changed(&app);
    Ok(note)
}

#[tauri::command]
pub async fn delete_note(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_note(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_notes_changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Commandes Journal (Phase P)
// ---------------------------------------------------------------------------

/// Événement diffusé après une mutation de bloc Journal (synchro multi-vues).
pub const JOURNAL_CHANGED: &str = "journal:changed";

fn notify_journal_changed(app: &AppHandle) {
    if let Err(e) = app.emit(JOURNAL_CHANGED, ()) {
        eprintln!("⚠️ Émission '{JOURNAL_CHANGED}' échouée: {e}");
    }
}

#[tauri::command]
pub async fn list_journal_entries_for_day(
    state: State<'_, AppState>,
    day: String,
) -> Result<Vec<JournalEntry>, String> {
    db::list_journal_entries_for_day(&state.pool, &day)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_upcoming_journal_entries(
    state: State<'_, AppState>,
    after_day: String,
) -> Result<Vec<JournalEntry>, String> {
    db::list_upcoming_journal_entries(&state.pool, &after_day)
        .await
        .map_err(|e| e.to_string())
}

/// Densité d'écriture du mois (`YYYY-MM`), pour le calendrier de l'en-tête.
#[tauri::command]
pub async fn count_journal_entries_by_month(
    state: State<'_, AppState>,
    month: String,
) -> Result<Vec<JournalDayCount>, String> {
    db::count_journal_entries_by_month(&state.pool, &month)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_journal_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateJournalEntry,
) -> Result<JournalEntry, String> {
    let entry = db::create_journal_entry(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_journal_changed(&app);
    Ok(entry)
}

/// Attache une image au journal, depuis un fichier choisi sur le disque.
///
/// On COPIE : l'original peut être déplacé, renommé ou vidé de la corbeille
/// sans que la journée y perde son image. C'est le prix d'un journal qui doit
/// se lire dans dix ans.
#[tauri::command]
pub async fn attach_journal_piece(
    state: State<'_, AppState>,
    app: AppHandle,
    source: String,
) -> Result<JournalPiece, String> {
    let chemin = std::path::PathBuf::from(&source);
    let nom = chemin
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Chemin de fichier illisible.".to_string())?
        .to_string();
    let octets = std::fs::read(&chemin).map_err(|e| e.to_string())?;
    let dossier = db::dossier_pieces(&app)?;
    db::create_journal_piece(&state.pool, &dossier, &nom, &octets).await
}

/// La même chose, depuis des octets — le chemin de COLLAGE.
///
/// Une capture d'écran collée n'a pas de fichier : le presse-papiers n'a que
/// des octets et un type. C'est le geste le plus fréquent pour une image dans
/// un journal, et il n'a pas d'autre porte : le glisser-déposer natif est
/// coupé sur la fenêtre principale (il empêcherait le réordonnancement des
/// tâches — voir `dragDropEnabled` dans `tauri.conf.json`).
#[tauri::command]
pub async fn attach_journal_piece_bytes(
    state: State<'_, AppState>,
    app: AppHandle,
    nom: String,
    octets: Vec<u8>,
) -> Result<JournalPiece, String> {
    let dossier = db::dossier_pieces(&app)?;
    db::create_journal_piece(&state.pool, &dossier, &nom, &octets).await
}

/// Range une note vocale, enregistrée par le webview.
///
/// La durée et les crêtes arrivent AVEC les octets : elles ont été mesurées
/// pendant qu'on parlait, et rien ne les retrouverait après. La durée parce
/// qu'un WebM de `MediaRecorder` n'en porte pas dans son en-tête ; les crêtes
/// parce qu'il faudrait décoder tout l'audio pour redessiner la vignette.
#[tauri::command]
pub async fn attach_journal_voice(
    state: State<'_, AppState>,
    app: AppHandle,
    nom: String,
    octets: Vec<u8>,
    duree_ms: i64,
    cretes: Vec<f32>,
) -> Result<JournalPiece, String> {
    let dossier = db::dossier_pieces(&app)?;
    db::create_journal_voice(&state.pool, &dossier, &nom, &octets, duree_ms, &cretes).await
}

/// Range la vignette d'un PDF, rendue par le webview.
///
/// Deux temps plutôt qu'un : la pièce est attachée et POSÉE dans la page tout
/// de suite, la vignette arrive après. Un PDF de trois méga-octets met un
/// moment à se rendre, et faire attendre la page devant un écran vide pour
/// une image qui n'est qu'un confort serait un mauvais marché.
#[tauri::command]
pub async fn set_journal_piece_apercu(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    octets: Vec<u8>,
    pages: i64,
) -> Result<JournalPiece, String> {
    let dossier = db::dossier_pieces(&app)?;
    db::set_journal_piece_apercu(&state.pool, &dossier, &id, &octets, pages).await
}

/// Les fiches des pièces citées par le document.
#[tauri::command]
pub async fn list_journal_pieces(
    state: State<'_, AppState>,
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<JournalPiece>, String> {
    let dossier = db::dossier_pieces(&app)?;
    db::list_journal_pieces(&state.pool, &dossier, &ids)
        .await
        .map_err(|e| e.to_string())
}

/// Sort tout le journal en Markdown, avec ses photos dans un dossier voisin.
///
/// Le document stocké ne porte que des renvois `piece:<id>` — un schéma
/// PRIVÉ, qui ne pointe nulle part hors de l'app. L'export les remplace par
/// des liens relatifs vers `<nom du fichier>-pieces/`, et copie les images
/// dedans : un dossier à côté du `.md` s'ouvre dans Obsidian, Typora, un
/// navigateur, n'importe où. On a écarté le base64 pour ça — il gonfle une
/// photo d'un tiers et presque rien ne l'affiche hors navigateur.
///
/// Le dialogue « Enregistrer sous » est côté frontend (natif, interactif) :
/// on reçoit un chemin déjà choisi, comme `export_backup`.
#[tauri::command]
pub async fn export_journal(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<JournalExport, String> {
    let entries = db::list_all_journal_entries(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    // Les identifiants cités par le journal, sans doublon — une même photo
    // peut être collée deux fois.
    let mut ids: Vec<String> = Vec::new();
    for e in &entries {
        for id in db::ids_pieces(&e.content) {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    let fiches = db::list_journal_pieces(&state.pool, &db::dossier_pieces(&app)?, &ids)
        .await
        .map_err(|e| e.to_string())?;

    db::ecrire_export(std::path::Path::new(&path), &entries, &fiches)
}

/// Cherche un passage dans tout le journal.
///
/// La limite vient du frontend : la palette en montre quelques-uns, la page de
/// recherche beaucoup plus. Rien ne sert de tout remonter pour en afficher six.
#[tauri::command]
pub async fn search_journal(
    state: State<'_, AppState>,
    query: String,
    limit: i64,
) -> Result<Vec<JournalHit>, String> {
    db::search_journal(&state.pool, &query, limit)
        .await
        .map_err(|e| e.to_string())
}

/// Écrire dans le journal du jour : la reprise en cours, ou une nouvelle.
///
/// Les deux fenêtres qui écrivent (la page-jour et la capture rapide) passent
/// par ici : c'est le seul endroit qui décide si un texte prolonge un moment
/// ou en ouvre un autre.
#[tauri::command]
pub async fn append_journal_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    target_day: String,
    content: String,
) -> Result<JournalEntry, String> {
    let entry = db::append_journal_entry(&state.pool, &target_day, &content)
        .await
        .map_err(|e| e.to_string())?;
    notify_journal_changed(&app);
    Ok(entry)
}

#[tauri::command]
pub async fn update_journal_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateJournalEntry,
) -> Result<JournalEntry, String> {
    let entry = db::update_journal_entry(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_journal_changed(&app);
    Ok(entry)
}

#[tauri::command]
pub async fn delete_journal_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_journal_entry(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_journal_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn set_journal_entry_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    tag_ids: Vec<String>,
) -> Result<JournalEntry, String> {
    let entry = db::set_journal_entry_tags(&state.pool, &id, &tag_ids)
        .await
        .map_err(|e| e.to_string())?;
    notify_journal_changed(&app);
    Ok(entry)
}

// ---------------------------------------------------------------------------
// Commandes fenêtres (show/hide au lieu de close/recreate)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn toggle_quick_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick") {
        if window.is_visible().map_err(|e| e.to_string())? {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    } else {
        // Filet de sécurité : la fenêtre est normalement déclarée en config.
        WebviewWindowBuilder::new(&app, "quick", WebviewUrl::App("/quick".into()))
            .title("Capture rapide")
            .inner_size(680.0, 180.0)
            .center()
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Masque la barre de capture rapide (appelée après validation / Échap / blur).
#[tauri::command]
pub async fn hide_quick_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window("main") {
        Some(window) => {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("Fenêtre principale introuvable".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Correction IA à la capture (Phase R2) — appel direct Rust → Groq, plus de
// sidecar Python. Best-effort : sans clé configurée ou en cas d'erreur
// réseau, l'appelant (features/todos/aiParse.ts) retombe silencieusement
// sur le parsing local (regex/chrono-node) — jamais bloquant pour l'UI.
// ---------------------------------------------------------------------------

const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
// `llama-3.3-70b-versatile` (modèle du sidecar Python d'origine) n'existe
// plus au catalogue Groq (vérifié via /v1/models le 2026-08-21) — remplacé
// par un modèle actuellement servi, rapide et qui respecte `response_format:
// json_object`.
const GROQ_MODEL: &str = "openai/gpt-oss-20b";

/// Même prompt que l'ancien `sidecar/main.py` (`build_system_prompt`), migré
/// tel quel : le contrat de sortie (JSON strict, champs, règles de priorité)
/// ne change pas, seul le transport change.
fn ai_parse_system_prompt() -> String {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    format!(
        r#"Tu extrais les informations d'une tâche à faire, écrite en langage naturel français, et tu réponds UNIQUEMENT avec un objet JSON (aucun texte autour), au format :
{{"text": string, "note": string|null, "due_date": string|null (YYYY-MM-DD), "priority": "low"|"normal"|"high", "list": string|null}}

- "text" : la tâche débarrassée de la date, du tag #liste et de la note "// ...".
- "note" : ce qui suit "//", sinon null.
- "due_date" : date ISO déduite du texte (aujourd'hui = {today}), sinon null.
- "list" : le mot après un tag #, sinon null.
- "priority" :
  - "high" si urgence explicite ("urgent", "important", "!!", "asap")
  - "normal" si NÉGATION d'urgence ("pas urgent", "rien d'urgent") — ne pas se laisser
    piéger par la seule présence du mot "urgent"
  - "low" si "plus tard", "quand possible", "pas pressé"
  - "normal" sinon

Exemples :
Texte : "appeler maman demain, pas urgent #famille // penser à son anniversaire"
JSON : {{"text": "appeler maman", "note": "penser à son anniversaire", "due_date": "2026-07-03", "priority": "normal", "list": "famille"}}

Texte : "finir le rapport vendredi urgent"
JSON : {{"text": "finir le rapport", "note": null, "due_date": "2026-07-04", "priority": "high", "list": null}}

Texte : "ranger le garage un jour, pas pressé"
JSON : {{"text": "ranger le garage", "note": null, "due_date": null, "priority": "low", "list": null}}
"#
    )
}

#[derive(serde::Serialize)]
struct GroqMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(serde::Serialize)]
struct GroqResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(serde::Serialize)]
struct GroqChatRequest<'a> {
    model: &'a str,
    messages: Vec<GroqMessage<'a>>,
    response_format: GroqResponseFormat,
    temperature: f32,
}

#[derive(serde::Deserialize)]
struct GroqChatResponse {
    choices: Vec<GroqChoice>,
}

#[derive(serde::Deserialize)]
struct GroqChoice {
    message: GroqResponseMessage,
}

#[derive(serde::Deserialize)]
struct GroqResponseMessage {
    content: String,
}

/// Extrait une tâche structurée depuis du texte libre via l'API Groq
/// (compatible OpenAI). Nécessite une clé configurée dans les Réglages.
#[tauri::command]
pub async fn ai_parse(state: State<'_, AppState>, text: String) -> Result<AiParsedTask, String> {
    let settings = db::get_settings(&state.pool).await.map_err(|e| e.to_string())?;
    let api_key = settings
        .groq_api_key
        .ok_or_else(|| "Aucune clé Groq configurée (Réglages → IA)".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let system_prompt = ai_parse_system_prompt();
    let body = GroqChatRequest {
        model: GROQ_MODEL,
        messages: vec![
            GroqMessage { role: "system", content: &system_prompt },
            GroqMessage { role: "user", content: &text },
        ],
        response_format: GroqResponseFormat { kind: "json_object" },
        temperature: 0.0,
    };

    let resp = client
        .post(GROQ_CHAT_URL)
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("Groq a répondu {status} : {detail}"));
    }

    let parsed: GroqChatResponse = resp.json().await.map_err(|e| e.to_string())?;
    let raw = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Réponse Groq vide".to_string())?;

    serde_json::from_str::<AiParsedTask>(&raw)
        .map_err(|e| format!("JSON invalide reçu de Groq : {e}"))
}

// L'ancienne commande `ai_agent` (sidecar Python, function-calling) a été
// retirée avec la Phase R : plus aucun appelant frontend (rebranché sur
// `ai_agent_run`, qui laisse l'agent exécuter lui-même via MCP). Les types
// `SidecarAgentResponse`/`AiNoteDraft` restent dans `models/ai.rs` (coût nul,
// pas de raison de les faire disparaître dans cette passe).

// `ai_search` (recherche sémantique Ctrl+K via le sidecar) retirée avec la
// Phase R : le vecteur/embeddings a été mis de côté (voir ROADMAP-PIVOT.md,
// R3 dépriorisé), Ctrl+K reste en recherche lexicale locale
// (features/search/lexical.ts, SearchOverlay.tsx).

// ---------------------------------------------------------------------------
// Agent par CLI (Phase R) — Claude Code connecté à notre serveur MCP.
// ---------------------------------------------------------------------------

/// Un tour d'agent via le CLI Claude (`claude -p`), qui écrit LUI-MÊME dans
/// la base en passant par le serveur MCP in-process (port présent dans
/// `AppState`). `history` (derniers échanges) est préfixé au prompt car le
/// CLI tourne sans session persistance (`--no-session-persistence`) : il faut
/// lui rappeler le fil pour résoudre « et demain ? » etc.
#[tauri::command]
pub async fn ai_agent_run(
    state: State<'_, AppState>,
    text: String,
    history: Vec<AiChatMessage>,
) -> Result<String, String> {
    use crate::cli_agent::AgentProvider;

    let port = state
        .mcp_port
        .ok_or_else(|| "Le serveur MCP n'a pas démarré".to_string())?;
    let settings = db::get_settings(&state.pool).await.map_err(|e| e.to_string())?;
    let provider: Box<dyn AgentProvider> = match settings.ai_provider.as_str() {
        "opencode" => Box::new(crate::cli_agent::OpenCodeProvider::resolve()?),
        _ => Box::new(crate::cli_agent::ClaudeProvider::resolve()?),
    };

    let prompt = agent_prompt(&text, &history);
    // R0 vérifié en conditions réelles : un tour focalisé prend ~12-18s selon
    // le provider. 240s datait d'avant le correctif `set_nonblocking` (le
    // serveur ne répondait jamais) — un vrai blocage laisserait l'Assistant
    // pendu 4 minutes.
    let timeout = std::time::Duration::from_secs(60);
    provider.run(&prompt, port, timeout).await
}

/// Assemble le prompt : historique (question/réponse) puis la nouvelle
/// demande, avec une phrase de cadrage rappelant l'existence des outils.
fn agent_prompt(text: &str, history: &[AiChatMessage]) -> String {
    let mut lines = Vec::new();
    if !history.is_empty() {
        lines.push("Historique de la conversation :".to_string());
        for msg in history {
            let who = match msg.role.as_str() {
                "user" => "Utilisateur",
                _ => "Assistant",
            };
            lines.push(format!("{who} : {}", msg.content));
        }
        lines.push("".to_string());
    }
    lines.push(format!(
        "Nouvelle demande : {text}\n\n\
         Tu es l'assistant de Listik. Utilise les outils MCP pour lire ou \
         modifier la base avant de répondre ; si une action est ambigüe, pose \
         une question au lieu d'inventer."
    ));
    lines.join("\n")
}

// ---------------------------------------------------------------------------
// Sauvegarde (export JSON complet)
// ---------------------------------------------------------------------------

/// Une pièce jointe dans la sauvegarde : sa fiche, et son nom DANS LE DOSSIER
/// voisin.
///
/// `chemin` (absolu, propre à cette machine) est conservé tel quel — il dit
/// d'où la pièce venait — mais c'est `fichier` qui compte pour retrouver les
/// octets. `None` quand la copie a échoué : le fichier avait disparu du
/// disque, et la fiche reste pour garder trace de ce qu'il y avait là.
#[derive(serde::Serialize)]
struct PieceSauvee {
    #[serde(flatten)]
    fiche: JournalPiece,
    fichier: Option<String>,
}

/// Tout ce que l'application détient.
///
/// Version 2. La 1 ne portait que les tâches et les NOTES — un module mort,
/// remplacé par le Journal — et laissait dehors les projets, domaines et
/// rubriques que les tâches référencent pourtant : même pour les tâches, elle
/// produisait des renvois orphelins.
#[derive(serde::Serialize)]
struct Sauvegarde {
    version: u32,
    exported_at: String,
    /// Le dossier voisin où sont les pièces, relatif au fichier JSON.
    pieces_dossier: String,
    todos: Vec<Todo>,
    areas: Vec<Area>,
    projects: Vec<Project>,
    headings: Vec<db::Entete>,
    tags: Vec<Tag>,
    orderings: Vec<db::Ordering>,
    journal: Vec<JournalEntry>,
    pieces: Vec<PieceSauvee>,
    settings: Settings,
}

/// Ce qu'une sauvegarde a emporté, pour pouvoir le dire.
///
/// « Enregistré » ne prouve rien : ce sont les nombres qui disent si le
/// fichier contient bien ce qu'on croit.
#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../features/backup/generated/")]
pub struct SauvegardeBilan {
    pub taches: u32,
    pub jours: u32,
    pub pieces: u32,
    /// Pièces dont le fichier a disparu du disque — leur fiche est gardée.
    pub pieces_manquantes: u32,
}

/// Écrit la sauvegarde : un JSON à l'emplacement choisi, et les pièces
/// jointes dans un dossier voisin.
///
/// DEUX OBJETS, PAS UN. Les photos, PDF et notes vocales sont la seule chose
/// irremplaçable ici — le texte se retape, une voix non — et un disque mort
/// emporte la base ET les fichiers. Les mettre en base64 dans le JSON aurait
/// tenu en un fichier, au prix d'un tiers de poids en plus et d'un document
/// qu'aucun éditeur n'ouvre. C'est l'idiome que l'export du journal utilise
/// déjà : un fichier, et son dossier à côté.
#[tauri::command]
pub async fn export_backup(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<SauvegardeBilan, String> {
    let pool = &state.pool;
    let cible = std::path::PathBuf::from(&path);
    let dossier_source = db::dossier_pieces(&app)?;

    let todos = db::list_all(pool).await.map_err(|e| e.to_string())?;
    let areas = db::list_areas(pool).await.map_err(|e| e.to_string())?;
    let projects = db::list_projects(pool).await.map_err(|e| e.to_string())?;
    let headings = db::list_headings(pool).await.map_err(|e| e.to_string())?;
    let tags = db::list_tags(pool).await.map_err(|e| e.to_string())?;
    let orderings = db::get_orderings(pool).await.map_err(|e| e.to_string())?;
    let journal = db::list_all_journal_entries_with_tags(pool)
        .await
        .map_err(|e| e.to_string())?;
    let fiches = db::list_all_journal_pieces(pool, &dossier_source)
        .await
        .map_err(|e| e.to_string())?;
    let settings = db::get_settings(pool).await.map_err(|e| e.to_string())?;

    // Le dossier porte le nom du fichier : deux sauvegardes dans le même
    // répertoire ne se mélangent pas.
    let nom_dossier = format!(
        "{}-pieces",
        cible.file_stem().and_then(|s| s.to_str()).unwrap_or("listik")
    );

    let mut pieces = Vec::with_capacity(fiches.len());
    let mut copiees = 0u32;
    let mut manquantes = 0u32;
    if !fiches.is_empty() {
        let dossier = cible.with_file_name(&nom_dossier);
        std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
        let mut pris = std::collections::HashSet::new();
        for fiche in fiches {
            // Le nom d'ORIGINE, dédupliqué — c'est lui qu'on reconnaît dans un
            // dossier, pas l'UUID du disque.
            let nom = db::nom_unique(&mut pris, &fiche.nom_origine);
            let fichier = if std::fs::copy(&fiche.chemin, dossier.join(&nom)).is_ok() {
                copiees += 1;
                Some(nom)
            } else {
                // Une pièce disparue n'arrête pas la sauvegarde : sa fiche
                // entre quand même, sans fichier.
                pris.remove(&nom);
                manquantes += 1;
                None
            };
            pieces.push(PieceSauvee { fiche, fichier });
        }
    }

    let mut jours: Vec<&str> = journal.iter().map(|e| e.target_day.as_str()).collect();
    jours.dedup();
    let bilan = SauvegardeBilan {
        taches: todos.len() as u32,
        jours: jours.len() as u32,
        pieces: copiees,
        pieces_manquantes: manquantes,
    };

    let sauvegarde = Sauvegarde {
        version: 2,
        exported_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        pieces_dossier: nom_dossier,
        todos,
        areas,
        projects,
        headings,
        tags,
        orderings,
        journal,
        pieces,
        settings,
    };

    let json = serde_json::to_string_pretty(&sauvegarde).map_err(|e| e.to_string())?;
    std::fs::write(&cible, json).map_err(|e| e.to_string())?;
    Ok(bilan)
}

// ---------------------------------------------------------------------------
// Commandes Domaines / Projets (structure Things — synchro multi-vues)
// ---------------------------------------------------------------------------

/// Diffusé après une mutation de domaine ou de projet (arbre du rail à revalider).
pub const PROJECTS_CHANGED: &str = "projects:changed";

fn notify_projects_changed(app: &AppHandle) {
    if let Err(e) = app.emit(PROJECTS_CHANGED, ()) {
        eprintln!("⚠️ Émission '{PROJECTS_CHANGED}' échouée: {e}");
    }
}

#[tauri::command]
pub async fn list_areas(state: State<'_, AppState>) -> Result<Vec<Area>, String> {
    db::list_areas(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_area(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateArea,
) -> Result<Area, String> {
    let area = db::create_area(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    Ok(area)
}

#[tauri::command]
pub async fn update_area(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateArea,
) -> Result<Area, String> {
    let area = db::update_area(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    Ok(area)
}

#[tauri::command]
pub async fn delete_area(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_area(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    db::list_projects(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_project(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateProject,
) -> Result<Project, String> {
    let project = db::create_project(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    Ok(project)
}

#[tauri::command]
pub async fn update_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateProject,
) -> Result<Project, String> {
    let project = db::update_project(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    Ok(project)
}

#[tauri::command]
pub async fn delete_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_project(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    // Des tâches ont pu être détachées → les vues de tâches se revalident aussi.
    notify_projects_changed(&app);
    notify_changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Commandes Tags (contexte transverse — synchro multi-vues)
// ---------------------------------------------------------------------------

/// Diffusé après une mutation de tag.
pub const TAGS_CHANGED: &str = "tags:changed";

fn notify_tags_changed(app: &AppHandle) {
    if let Err(e) = app.emit(TAGS_CHANGED, ()) {
        eprintln!("⚠️ Émission '{TAGS_CHANGED}' échouée: {e}");
    }
}

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    db::list_tags(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateTag,
) -> Result<Tag, String> {
    let tag = db::create_tag(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_tags_changed(&app);
    Ok(tag)
}

#[tauri::command]
pub async fn update_tag(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateTag,
) -> Result<Tag, String> {
    let tag = db::update_tag(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_tags_changed(&app);
    // Les tags sont dénormalisés dans chaque `Todo` : un renommage périme les
    // pastilles de toutes les tâches porteuses. Sans cet événement, elles
    // afficheraient l'ancien nom jusqu'à une mutation sans rapport.
    notify_changed(&app);
    Ok(tag)
}

/// Remplace l'intégralité des tags d'une tâche (sémantique « replace-all »).
#[tauri::command]
pub async fn set_todo_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    tag_ids: Vec<String>,
) -> Result<Todo, String> {
    let todo = db::set_todo_tags(&state.pool, &id, &tag_ids)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(todo)
}

#[tauri::command]
pub async fn delete_tag(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_tag(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_tags_changed(&app);
    // Les liaisons ont disparu → les pastilles des tâches porteuses aussi.
    notify_changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Duplication (Phase L — « gabarit réutilisable »)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn duplicate_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Todo, String> {
    let todo = db::duplicate_todo(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(todo)
}

#[tauri::command]
pub async fn duplicate_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Project, String> {
    let project = db::duplicate_project(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_projects_changed(&app);
    // Ses tâches sont nouvelles : les vues de tâches doivent aussi se revalider.
    notify_changed(&app);
    Ok(project)
}

// ---------------------------------------------------------------------------
// Commandes ordre manuel
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_orderings(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::Ordering>, String> {
    db::get_orderings(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

/// Remplace l'ordre manuel d'un contexte (drag & drop / déplacement clavier).
#[tauri::command]
pub async fn set_ordering(
    app: AppHandle,
    state: State<'_, AppState>,
    context: String,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    db::set_ordering(&state.pool, &context, &ordered_ids)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Commandes Sous-tâches (checklist à un niveau)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateSubTask,
) -> Result<SubTask, String> {
    let sub = db::create_subtask(&state.pool, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(sub)
}

#[tauri::command]
pub async fn update_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: UpdateSubTask,
) -> Result<SubTask, String> {
    let sub = db::update_subtask(&state.pool, &id, payload)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(sub)
}

#[tauri::command]
pub async fn delete_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_subtask(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    notify_changed(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_prompt_contient_demande_et_cadrage() {
        let prompt = agent_prompt("ajoute une tache", &[]);
        assert!(prompt.contains("ajoute une tache"));
        assert!(prompt.contains("outils MCP"), "le cadrage doit mentionner les outils");
    }

    #[test]
    fn agent_prompt_reprend_l_historique() {
        let history = vec![
            AiChatMessage { role: "user".into(), content: "preparer la reunio".into() },
            AiChatMessage { role: "assistant".into(), content: "c'est note".into() },
        ];
        let prompt = agent_prompt("et demain ?", &history);
        assert!(prompt.contains("preparer la reunio"));
        assert!(prompt.contains("et demain ?"));
    }

    /// Vérifie la frontière `invoke("ai_parse", { text })` -> `fn ai_parse(state:
    /// State<AppState>, text: String)` via le VRAI dispatch IPC de Tauri
    /// (`tauri::test`), pas un appel direct de fonction Rust qui contournerait
    /// la désérialisation des arguments. Sans clé Groq configurée (DB en
    /// mémoire fraîche), la commande doit atteindre son erreur métier
    /// (« Aucune clé Groq configurée ») — pas une erreur de désérialisation
    /// d'arguments, qui prouverait que `state` (1er paramètre, injecté par
    /// Tauri) et `text` (2e paramètre, envoyé par le frontend) sont bien
    /// distingués correctement.
    #[tokio::test(flavor = "multi_thread")]
    async fn invoke_ai_parse_desemballe_lardgument_text_correctement() {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![ai_parse])
            .manage(AppState { pool, mcp_port: None })
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("échec construction app de test");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("échec construction webview de test");

        let response = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "ai_parse".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: serde_json::json!({ "text": "acheter du pain demain" }).into(),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );

        let err = response.expect_err("sans clé Groq configurée, ai_parse doit échouer");
        let message = err.as_str().unwrap_or_default();
        assert!(
            message.contains("clé Groq"),
            "attendu l'erreur métier « clé Groq manquante », reçu autre chose \
             (signe possible d'une désérialisation d'arguments ratée) : {message}"
        );
    }

    /// Même vérification de frontière, pour `ai_agent_run` (state + text +
    /// history, trois paramètres au lieu de deux) : `mcp_port: None` fait
    /// échouer la commande tôt, avant tout appel réseau/CLI payant, tout en
    /// prouvant que les trois arguments sont bien désérialisés/injectés.
    #[tokio::test(flavor = "multi_thread")]
    async fn invoke_ai_agent_run_desemballe_text_et_history_correctement() {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![ai_agent_run])
            .manage(AppState { pool, mcp_port: None })
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("échec construction app de test");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("échec construction webview de test");

        let response = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "ai_agent_run".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: serde_json::json!({
                    "text": "et demain ?",
                    "history": [{ "role": "user", "content": "prepare la reunion" }]
                })
                .into(),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );

        let err = response.expect_err("sans serveur MCP démarré, ai_agent_run doit échouer");
        let message = err.as_str().unwrap_or_default();
        assert!(
            message.contains("MCP"),
            "attendu l'erreur métier « serveur MCP pas démarré », reçu autre chose \
             (signe possible d'une désérialisation d'arguments ratée) : {message}"
        );
    }

    #[test]
    fn ai_parse_system_prompt_decrit_le_format_attendu() {
        let prompt = ai_parse_system_prompt();
        assert!(prompt.contains("\"text\""));
        assert!(prompt.contains("due_date"));
        assert!(prompt.contains(&chrono::Local::now().format("%Y-%m-%d").to_string()));
    }

    /// Bout-en-bout, une seule fois (coût réseau réel) : le morceau qui
    /// n'était vérifié nulle part ailleurs — que `ai_agent_run`, appelé via
    /// le VRAI dispatch IPC (pas un appel direct de fonction), lit bien
    /// `ai_provider` dans les Réglages et route vers le bon `AgentProvider`,
    /// avec un vrai serveur MCP qui répond. `#[test]` (pas `#[tokio::test]`) :
    /// `spawn_mcp_server` panique s'il est appelé depuis un contexte async
    /// déjà actif (voir cli_agent.rs) ; `get_ipc_response` n'est pas async,
    /// donc ce mélange sync/async fonctionne sans ce piège.
    #[test]
    #[ignore = "appelle le vrai binaire claude (réseau + abonnement)"]
    fn invoke_ai_agent_run_lit_le_provider_en_reglages_et_execute_pour_de_vrai() {
        use crate::cli_agent::{DbExecutor, ToolExecutor};

        let rt = tokio::runtime::Runtime::new().unwrap();
        let _guard = rt.enter();

        let pool = rt.block_on(async {
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(":memory:")
                .create_if_missing(true);
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options)
                .await
                .unwrap();
            sqlx::migrate!("./migrations").run(&pool).await.unwrap();
            db::update_settings(
                &pool,
                crate::models::UpdateSettings {
                    ai_provider: Some("claude".to_string()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            pool
        });

        let executor =
            std::sync::Arc::new(DbExecutor::new(pool.clone(), None)) as std::sync::Arc<dyn ToolExecutor>;
        rt.block_on(executor.call("create_todo", serde_json::json!({ "text": "acheter des kiwis violets" })))
            .unwrap();
        let port = crate::cli_agent::spawn_mcp_server(executor).expect("le serveur MCP doit démarrer");

        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![ai_agent_run])
            .manage(AppState { pool, mcp_port: Some(port) })
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("échec construction app de test");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("échec construction webview de test");

        let response = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "ai_agent_run".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: serde_json::json!({
                    "text": "Utilise l'outil list_todos pour lister mes tâches en attente, \
                             puis cite le texte exact de chacune.",
                    "history": []
                })
                .into(),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );

        let body = response.expect("le tour d'agent a échoué");
        let answer = body.deserialize::<String>().unwrap();
        assert!(
            answer.to_lowercase().contains("kiwis violets"),
            "la réponse (via invoke() complet, provider lu en Réglages) ne cite pas la tâche \
             seedée : {answer}"
        );
    }

    #[test]
    fn groq_chat_response_desanitize_le_contenu_du_premier_choix() {
        let raw = r#"{"choices":[{"message":{"content":"{\"text\":\"acheter du pain\",\"note\":null,\"due_date\":null,\"priority\":\"normal\",\"list\":null}"}}]}"#;
        let parsed: GroqChatResponse = serde_json::from_str(raw).unwrap();
        let content = parsed.choices.into_iter().next().unwrap().message.content;
        let task: AiParsedTask = serde_json::from_str(&content).unwrap();
        assert_eq!(task.text, "acheter du pain");
    }
}
