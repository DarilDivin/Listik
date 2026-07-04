use crate::db::{self, AppState};
use crate::models::{
    AiParsedTask, CreateNote, CreateTodo, Note, Settings, Todo, UpdateNote, UpdateSettings,
    UpdateTodo,
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
