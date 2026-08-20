use crate::db::{self, AppState};
use crate::models::{
    AiAgentResponse, AiChatMessage, AiParsedTask, AiSource, Area, CreateArea, CreateJournalEntry,
    CreateNote, CreateProject, CreateSubTask, CreateTag, CreateTodo, JournalEntry, Note, Project,
    Settings, SidecarAgentResponse, SubTask, Tag, Todo, UpdateArea, UpdateJournalEntry, UpdateNote,
    UpdateProject, UpdateSettings, UpdateSubTask, UpdateTag, UpdateTodo,
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

#[derive(serde::Serialize)]
struct AgentRequest<'a> {
    text: &'a str,
    history: &'a [AiChatMessage],
}

/// Un tour d'agent : le sidecar (LLM) choisit un outil ; Rust exécute les
/// mutations (propriétaire de SQLite) en réutilisant ses commandes existantes,
/// et renvoie le message + sources à afficher. `answer_question` est déjà
/// résolu côté sidecar (RAG), il n'y a rien à exécuter ici. `history` : les
/// derniers échanges (question/réponse), pour que le LLM résolve les
/// références au contexte ("et demain ?") — voir docs/APPRENTISSAGE.md.
#[tauri::command]
pub async fn ai_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
    history: Vec<AiChatMessage>,
) -> Result<AiAgentResponse, String> {
    let url = format!("http://127.0.0.1:{}/agent", crate::sidecar::SIDECAR_PORT);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .json(&AgentRequest { text: &text, history: &history })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Sidecar /agent a répondu {}", resp.status()));
    }
    let agent: SidecarAgentResponse = resp.json().await.map_err(|e| e.to_string())?;

    match agent.tool.as_str() {
        "create_task" => {
            if let Some(task) = agent.task {
                let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                let payload = CreateTodo {
                    text: task.text,
                    note: task.note,
                    list: task.list,
                    priority: Some(task.priority),
                    recurrence: None,
                    recur_interval: 1,
                    recur_weekday: None,
                    recur_setpos: None,
                    recur_mode: crate::models::RecurMode::Fixed,
                    // La date extraite par l'IA est un « quand » (planification),
                    // pas une échéance : celle-ci ne se pose que dans le détail.
                    scheduled_for: Some(task.due_date.unwrap_or(today)),
                    due_date: None,
                    remind_at: None,
                    project_id: None,
                    area_id: None,
                    heading_id: None,
                    this_evening: false,
                    someday: false,
                };
                db::create(&state.pool, payload)
                    .await
                    .map_err(|e| e.to_string())?;
                notify_changed(&app);
            }
        }
        "create_note" => {
            if let Some(note) = agent.note {
                let payload = CreateNote {
                    title: Some(note.title),
                    content: Some(note.content),
                };
                db::create_note(&state.pool, payload)
                    .await
                    .map_err(|e| e.to_string())?;
                notify_notes_changed(&app);
            }
        }
        // update_task / delete_task : la tâche est déjà résolue (task_id) par
        // le sidecar, mais PAS exécutée ici — c'est le frontend qui appelle
        // updateTodo/deleteTodo (mêmes mutations que l'UI manuelle, undo
        // compris pour la suppression). answer_question / not_found : rien à
        // exécuter, déjà résolu par le sidecar.
        _ => {}
    }

    Ok(AiAgentResponse {
        message: agent.message,
        tool: agent.tool,
        sources: agent.sources,
        task_id: agent.task_id,
        task_update: agent.update,
    })
}

#[derive(serde::Serialize)]
struct SearchRequest<'a> {
    query: &'a str,
    k: u32,
}

/// Recherche sémantique directe (sans passer par l'agent conversationnel) :
/// relaie tel quel vers le `/search` du sidecar (D2).
#[tauri::command]
pub async fn ai_search(query: String, k: u32) -> Result<Vec<AiSource>, String> {
    let url = format!("http://127.0.0.1:{}/search", crate::sidecar::SIDECAR_PORT);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .json(&SearchRequest { query: &query, k })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Sidecar /search a répondu {}", resp.status()));
    }
    resp.json::<Vec<AiSource>>().await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Agent par CLI (Phase R) — Claude Code connecté à notre serveur MCP.
// ---------------------------------------------------------------------------

/// Un tour d'agent via le CLI Claude (`claude -p`), qui écrit LUI-MÊME dans
/// la base en passant par le serveur MCP in-process (port présent dans
/// `AppState`). `history` (derniers échanges) est préfixé au prompt car le
/// CLI tourne sans session persistance (`--no-session-persistence`) : il faut
/// lui rappeler le fil pour résoudre « et demain ? » etc.
#[tauri::command]
pub async fn ai_agent_claude(
    state: State<'_, AppState>,
    text: String,
    history: Vec<AiChatMessage>,
) -> Result<String, String> {
    use crate::cli_agent::AgentProvider;

    let port = state
        .mcp_port
        .ok_or_else(|| "Le serveur MCP n'a pas démarré".to_string())?;
    let provider = crate::cli_agent::ClaudeProvider::resolve()?;

    let prompt = agent_prompt(&text, &history);
    // R0 vérifié en conditions réelles : un tour focalisé prend ~12s. 240s
    // datait d'avant le correctif `set_nonblocking` (le serveur ne répondait
    // jamais) — un vrai blocage laisserait l'Assistant pendu 4 minutes.
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

#[derive(serde::Serialize)]
struct Backup {
    version: u32,
    exported_at: String,
    todos: Vec<Todo>,
    notes: Vec<Note>,
}

/// Écrit un backup JSON (toutes les tâches + notes) à l'emplacement choisi
/// par l'utilisateur (dialogue "Enregistrer sous" géré côté frontend).
#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let todos = db::list_all(&state.pool).await.map_err(|e| e.to_string())?;
    let notes = db::list_notes(&state.pool).await.map_err(|e| e.to_string())?;

    let backup = Backup {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        todos,
        notes,
    };

    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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

    #[test]
    fn ai_parse_system_prompt_decrit_le_format_attendu() {
        let prompt = ai_parse_system_prompt();
        assert!(prompt.contains("\"text\""));
        assert!(prompt.contains("due_date"));
        assert!(prompt.contains(&chrono::Local::now().format("%Y-%m-%d").to_string()));
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
