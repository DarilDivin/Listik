//! Pipeline d'indexation asynchrone : synchronise SQLite (source de vérité,
//! Rust) vers la base vectorielle du sidecar (recherche sémantique, D2).
//! Calqué sur `reminders.rs` : tick périodique, idempotent, tolérant aux
//! pannes (sidecar indisponible → on retente au tick suivant, le drapeau
//! `needs_embedding` reste levé jusqu'au succès).

use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::db::{self, AppState, EmbeddingItem};

const TICK: Duration = Duration::from_secs(5);
const BATCH_SIZE: i64 = 20;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Lance la boucle de synchronisation en arrière-plan (à appeler une fois au setup()).
pub fn spawn_indexer(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(TICK);
        loop {
            ticker.tick().await;
            if let Err(e) = run_once(&app).await {
                eprintln!("⚠️ Pipeline d'indexation: {e}");
            }
        }
    });
}

/// Un tick : répercute les suppressions, puis indexe tâches et notes en attente.
async fn run_once(app: &AppHandle) -> Result<(), String> {
    let pool = app.state::<AppState>().pool.clone();

    for (id, _kind) in db::pending_deindex(&pool, BATCH_SIZE).await.map_err(|e| e.to_string())? {
        if deindex(&id).await.is_ok() {
            db::clear_pending_deindex(&pool, &id).await.map_err(|e| e.to_string())?;
        }
        // Échec (sidecar pas prêt...) : on laisse en attente, retenté au prochain tick.
    }

    for item in db::todos_needing_embedding(&pool, BATCH_SIZE).await.map_err(|e| e.to_string())? {
        if index(&item).await.is_ok() {
            db::mark_todo_embedded(&pool, &item.id).await.map_err(|e| e.to_string())?;
        }
    }

    for item in db::notes_needing_embedding(&pool, BATCH_SIZE).await.map_err(|e| e.to_string())? {
        if index(&item).await.is_ok() {
            db::mark_note_embedded(&pool, &item.id).await.map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())
}

async fn index(item: &EmbeddingItem) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct Req<'a> {
        id: &'a str,
        r#type: &'a str,
        text: &'a str,
    }

    let url = format!("http://127.0.0.1:{}/index", crate::sidecar::SIDECAR_PORT);
    let resp = http_client()?
        .post(&url)
        .json(&Req { id: &item.id, r#type: item.kind, text: &item.text })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("sidecar /index a répondu {}", resp.status()));
    }
    Ok(())
}

async fn deindex(id: &str) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct Req<'a> {
        id: &'a str,
    }

    let url = format!("http://127.0.0.1:{}/deindex", crate::sidecar::SIDECAR_PORT);
    let resp = http_client()?
        .post(&url)
        .json(&Req { id })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("sidecar /deindex a répondu {}", resp.status()));
    }
    Ok(())
}
