use crate::db::{self, AppState};
use crate::models::{
    AiAgentResponse, AiChatMessage, AiParsedTask, AiSource, Area, CreateArea, CreateNote,
    CreateProject, CreateSubTask, CreateTag, CreateTodo, Note, Project, Settings,
    SidecarAgentResponse, SubTask, Tag, Todo, UpdateArea, UpdateNote, UpdateProject, UpdateSettings,
    UpdateSubTask, UpdateTag, UpdateTodo,
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
// Commandes IA (sidecar Python) — D0 : juste un ping de santé.
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_ping() -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}/health", crate::sidecar::SIDECAR_PORT);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct ParseRequest<'a> {
    text: &'a str,
}

/// Demande au sidecar d'extraire une tâche structurée depuis du texte libre.
/// Timeout court : en cas d'indisponibilité (pas de clé API, sidecar down...),
/// l'appelant doit pouvoir retomber sur le parsing local sans bloquer l'UI.
#[tauri::command]
pub async fn ai_parse(text: String) -> Result<AiParsedTask, String> {
    let url = format!("http://127.0.0.1:{}/parse", crate::sidecar::SIDECAR_PORT);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .json(&ParseRequest { text: &text })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Sidecar /parse a répondu {}", resp.status()));
    }
    resp.json::<AiParsedTask>().await.map_err(|e| e.to_string())
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
                    scheduled_for: Some(task.due_date.clone().unwrap_or(today)),
                    due_date: task.due_date,
                    remind_at: None,
                    project_id: None,
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
    Ok(tag)
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
    // Des liaisons de tâches ont pu disparaître → revalider aussi les tâches.
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
