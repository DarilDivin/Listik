//! Planificateur de rappels : une tâche de fond vérifie périodiquement les
//! rappels échus (`remind_at` <= maintenant) et envoie une notification système,
//! même si aucune fenêtre n'est ouverte. La comparaison se fait sur l'heure
//! LOCALE, au même format que `remind_at` (« YYYY-MM-DDTHH:MM »).

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::commands::TODOS_CHANGED;
use crate::db::{self, AppState};

/// Intervalle de vérification des rappels : 10 s borne la latence à ~10 s
/// après l'heure pile, pour un coût négligeable (petite requête indexée).
const TICK: Duration = Duration::from_secs(10);

/// Lance la boucle de vérification en arrière-plan (à appeler une fois au setup).
pub fn spawn_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(TICK);
        loop {
            ticker.tick().await;
            if let Err(e) = check_due(&app).await {
                eprintln!("⚠️ Planificateur de rappels: {e}");
            }
        }
    });
}

/// Un tick : rappels échus par tâche + éventuel résumé quotidien.
async fn check_due(app: &AppHandle) -> Result<(), String> {
    let pool = app.state::<AppState>().pool.clone();
    let now = chrono::Local::now();

    let changed = check_reminders(app, &pool, &now).await?;
    check_digest(app, &pool, &now).await?;

    if changed {
        // Des rappels ont été marqués envoyés → rafraîchir les fenêtres ouvertes.
        let _ = app.emit(TODOS_CHANGED, ());
    }
    Ok(())
}

/// Envoie les rappels par tâche échus et les marque comme notifiés.
/// Renvoie `true` si au moins un rappel a été traité.
async fn check_reminders(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
    now: &chrono::DateTime<chrono::Local>,
) -> Result<bool, String> {
    let now_str = now.format("%Y-%m-%dT%H:%M").to_string();
    let due = db::due_reminders(pool, &now_str)
        .await
        .map_err(|e| e.to_string())?;
    if due.is_empty() {
        return Ok(false);
    }

    for todo in &due {
        let mut builder = app.notification().builder().title(todo.text.clone());
        if let Some(note) = todo.note.as_deref().filter(|n| !n.is_empty()) {
            builder = builder.body(note);
        }
        if let Err(e) = builder.show() {
            eprintln!("⚠️ Notification échouée pour « {} »: {e}", todo.text);
        }
        db::mark_reminded(pool, &todo.id)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(true)
}

/// Envoie le résumé quotidien si l'heure configurée est atteinte (une fois/jour).
async fn check_digest(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
    now: &chrono::DateTime<chrono::Local>,
) -> Result<(), String> {
    let today = now.format("%Y-%m-%d").to_string();
    let current_time = now.format("%H:%M").to_string();

    let Some(tasks) = db::take_due_digest(pool, &today, &current_time)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };

    if tasks.is_empty() {
        return Ok(());
    }

    let count = tasks.len();
    let title = format!("{count} tâche{} aujourd'hui", if count > 1 { "s" } else { "" });
    let mut lines: Vec<String> = tasks.iter().take(5).map(|t| format!("• {}", t.text)).collect();
    if count > 5 {
        lines.push("…".to_string());
    }
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(lines.join("\n"))
        .show()
    {
        eprintln!("⚠️ Notification du résumé quotidien échouée: {e}");
    }
    Ok(())
}
