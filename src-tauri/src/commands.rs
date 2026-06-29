use crate::db::{self, AppState};
use crate::models::{CreateTodo, Settings, Todo, UpdateSettings, UpdateTodo};
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
pub async fn open_planner_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("planner") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "planner", WebviewUrl::App("/planner".into()))
            .title("Planificateur Listik")
            .inner_size(1200.0, 800.0)
            .center()
            .decorations(false)
            .resizable(true)
            .build()
            .map_err(|e| e.to_string())?;
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
