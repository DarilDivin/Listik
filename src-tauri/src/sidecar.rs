//! Sidecar Python : lance en arrière-plan le serveur FastAPI qui portera l'IA
//! (LLM, embeddings, RAG...), attend qu'il réponde, et le termine proprement à
//! la fermeture de l'app. Rust reste le seul point d'entrée du webview vers
//! l'IA — aucun appel direct du navigateur vers Python.
//!
//! D0 : le sidecar n'expose que `GET /health`. Le chemin de l'exécutable vise
//! le venv local `sidecar/.venv` (dev uniquement) ; en production il faudra
//! basculer sur un binaire packagé (PyInstaller) via `externalBin` de Tauri.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};

/// Port fixe pour l'instant (deviendra configurable si collision détectée).
pub const SIDECAR_PORT: u16 = 8420;

#[cfg(windows)]
const VENV_PYTHON: &str = ".venv/Scripts/python.exe";
#[cfg(not(windows))]
const VENV_PYTHON: &str = ".venv/bin/python";

/// Process Python géré, stocké dans l'état partagé de l'app pour pouvoir le
/// tuer explicitement à la fermeture (sinon il continuerait de tourner seul).
pub struct SidecarState(pub Mutex<Option<Child>>);

impl SidecarState {
    pub fn empty() -> Self {
        Self(Mutex::new(None))
    }
}

fn sidecar_dir() -> PathBuf {
    // CARGO_MANIFEST_DIR = dossier de ce crate (src-tauri), résolu à la compilation.
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../sidecar")
}

/// Lance le process Python et attend qu'il réponde sur /health (à appeler au setup()).
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match start_process() {
            Ok(child) => {
                if let Some(state) = app.try_state::<SidecarState>() {
                    *state.0.lock().unwrap() = Some(child);
                }
                wait_until_ready().await;
            }
            Err(e) => eprintln!("⚠️ Échec du lancement du sidecar Python: {e}"),
        }
    });
}

fn start_process() -> std::io::Result<Child> {
    let dir = sidecar_dir();
    Command::new(dir.join(VENV_PYTHON))
        .arg(dir.join("main.py"))
        .arg("--port")
        .arg(SIDECAR_PORT.to_string())
        .kill_on_drop(true)
        .spawn()
}

/// Interroge /health toutes les 300ms jusqu'à 10s, pour savoir quand le serveur est prêt.
async fn wait_until_ready() {
    let url = format!("http://127.0.0.1:{SIDECAR_PORT}/health");
    for _ in 0..33 {
        if reqwest::get(&url)
            .await
            .is_ok_and(|r| r.status().is_success())
        {
            println!("✅ Sidecar Python prêt sur le port {SIDECAR_PORT}");
            return;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    eprintln!(
        "⚠️ Sidecar Python: pas de réponse après 10s (venv installé ? `pip install -r sidecar/requirements.txt`)"
    );
}

/// Termine le process Python (à appeler sur RunEvent::Exit).
pub fn kill(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(mut child) = state.0.lock().unwrap().take() {
            let _ = child.start_kill();
        }
    }
}
