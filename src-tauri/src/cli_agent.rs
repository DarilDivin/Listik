//! Agent conversationnel par CLI d'abonnement (Phases R du pivot post-Things).
//!
//! R0 (fait) : l'ossature indépendante de l'auth du CLI —
//!   - un **serveur MCP** exécuté in-process, exposé en HTTP sur le loopback
//!     (transport « streamable HTTP » que Claude Code et Gemini savent consommer),
//!   - le **spawn du CLI** (`claude -p` …) en sous-processus avec timeout et
//!     capture JSON, muni d'un `--mcp-config` qui pointe vers notre serveur HTTP.
//! R4 (fait) : `DbExecutor` branche les vrais outils (todos/notes/journal) sur
//!   le pool SQLite partagé, en émettant les mêmes événements que les commandes.
//! R5 (fait) : la couche `AgentProvider` (trait) abstrait le moteur plein texte
//!   — `ClaudeProvider` aujourd'hui, d'autres demain.
//!
//! Design: le serveur vit DANS le process de l'app → il partage le `AppState`/pool
//! SQLite → les mutations des outils émettent `todos:changed`/`journal:changed`
//! comme un clic utilisateur (le fameux contrat [[todos-data-architecture]]).
//! En conséquence on n'a JAMAIS besoin d'un binaire MCP séparé : le process
//! Listik lui-même porte le serveur, Claude Code s'y connecte par HTTP.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};
use tokio::net::TcpListener;

/// Version du protocole MCP que ce serveur parle (celle reconnue par Claude Code).
pub const MCP_PROTOCOL_VERSION: &str = "2025-03-26";

/// Port de départ pour chercher un port libre (l'app essaiera port..port+20).
pub const MCP_PORT_RANGE_START: u16 = 18420;

// ---------------------------------------------------------------------------
// Registre d'outils (découplé du process : testable sans serveur)
// ---------------------------------------------------------------------------

/// Description statique d'un outil MCP (schéma JSON-Schema pour `inputSchema`).
#[derive(Clone, Debug)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

impl ToolSpec {
    fn to_mcp(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        })
    }
}

/// Quelque chose capable d'exécuter les outils MCP.
/// R0 : implémentation `EchoExecutor` (validation du protocole).
/// R4 : implémentation `DbExecutor` (pool sqlx + AppHandle, outils réels).
/// La méthode `call` est désucrée en `Box::pin` pour rester dyn-compatible
/// (les traits avec `async fn` générique ne le sont pas).
pub trait ToolExecutor: Send + Sync {
    fn tools(&self) -> Vec<ToolSpec>;
    fn call<'a>(
        &'a self,
        tool: &'a str,
        arguments: Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>>;
}

/// Exécuteur minimal pour le spike : un seul outil `echo` qui renvoie `text`.
#[derive(Debug, Default)]
pub struct EchoExecutor;

impl ToolExecutor for EchoExecutor {
    fn tools(&self) -> Vec<ToolSpec> {
        vec![ToolSpec {
            name: "echo".into(),
            description: "Renvole la valeur passée dans le champ `text`.".into(),
            input_schema: json!({
                "type": "object",
                "properties": { "text": { "type": "string" } },
                "required": ["text"]
            }),
        }]
    }

    fn call<'a>(
        &'a self,
        tool: &'a str,
        arguments: Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>>
    {
        Box::pin(async move {
            match tool {
                "echo" => Ok(json!({ "text": arguments.get("text").cloned() })),
                other => Err(format!("outil inconnu : {other}")),
            }
        })
    }
}

// ---------------------------------------------------------------------------
// R4 — DbExecutor : vrais outils (todos / notes / journal) sur le pool sqlx.
// Les mutations émettent les mêmes événements que les commandes Tauri
// (`todos:changed`…), pour que le frontend garde son contrat multi-fenêtres.
// ---------------------------------------------------------------------------

/// Exécuteur MCP branché sur la base réelle. Les arguments JSON-Schema des
/// outils sont intentionnellement lâches (champs optionnels) : le LLM donne ce
/// qu'il sait, le reste garde ses défauts.
pub struct DbExecutor {
    pool: sqlx::SqlitePool,
    /// Présent en production pour diffuser `todos:changed`/`journal:changed`.
    app: Option<tauri::AppHandle>,
}

impl DbExecutor {
    pub fn new(pool: sqlx::SqlitePool, app: Option<tauri::AppHandle>) -> Self {
        Self { pool, app }
    }

    fn emit(&self, event: &str) {
        if let Some(app) = &self.app {
            use tauri::Emitter;
            let _ = app.emit(event, ());
        }
    }

    fn todo(args: &Value) -> crate::models::CreateTodo {
        crate::models::CreateTodo {
            text: args.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
            note: args_opt_string(args, "note"),
            list: args_opt_string(args, "list"),
            priority: args_opt_priority(args, "priority"),
            recurrence: None,
            recur_interval: 1,
            recur_weekday: None,
            recur_weekdays: None,
            recur_setpos: None,
            recur_mode: crate::models::RecurMode::Fixed,
            scheduled_for: args_opt_string(args, "scheduled_for"),
            due_date: args_opt_string(args, "due_date"),
            remind_at: args_opt_string(args, "remind_at"),
            project_id: args_opt_string(args, "project_id"),
            area_id: args_opt_string(args, "area_id"),
            heading_id: None,
            this_evening: args.get("this_evening").and_then(Value::as_bool).unwrap_or(false),
            someday: args.get("someday").and_then(Value::as_bool).unwrap_or(false),
        }
    }

    fn tools() -> Vec<ToolSpec> {
        vec![
            ToolSpec {
                name: "list_todos".into(),
                description: "Liste les tâches. Filtres optionnels : `status` (pending|completed|cancelled), `date` (YYYY-MM-DD, tâches du jour).".into(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "status": { "type": "string", "enum": ["pending", "completed", "cancelled"] },
                        "date": { "type": "string", "description": "YYYY-MM-DD" }
                    }
                }),
            },
            ToolSpec {
                name: "create_todo".into(),
                description: "Crée une tâche. `text` est obligatoire. Options : note, priority (low|normal|high), project_id, area_id, scheduled_for / due_date (YYYY-MM-DD), remind_at (YYYY-MM-DDTHH:MM)".into(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string" },
                        "note": { "type": "string" },
                        "priority": { "type": "string", "enum": ["low", "normal", "high"] },
                        "project_id": { "type": "string" },
                        "area_id": { "type": "string" },
                        "scheduled_for": { "type": "string" },
                        "due_date": { "type": "string" },
                        "remind_at": { "type": "string" }
                    },
                    "required": ["text"]
                }),
            },
            ToolSpec {
                name: "update_todo".into(),
                description: "Met à jour une tâche par `id`. Seuls les champs fournis sont écrits ; `status` accepte pending|completed|cancelled.".into(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "text": { "type": "string" },
                        "note": { "type": ["string", "null"] },
                        "status": { "type": "string", "enum": ["pending", "completed", "cancelled"] },
                        "priority": { "type": "string", "enum": ["low", "normal", "high"] },
                        "scheduled_for": { "type": ["string", "null"] },
                        "due_date": { "type": ["string", "null"] },
                        "remind_at": { "type": ["string", "null"] },
                        "project_id": { "type": ["string", "null"] },
                        "area_id": { "type": ["string", "null"] }
                    },
                    "required": ["id"]
                }),
            },
            ToolSpec {
                name: "toggle_todo".into(),
                description: "Bascule une tâche entre pending et completed (laisse cancelled inchangé). `id` obligatoire.".into(),
                input_schema: json!({ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }),
            },
            ToolSpec {
                name: "delete_todo".into(),
                description: "Supprime définitivement une tâche. `id` obligatoire.".into(),
                input_schema: json!({ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }),
            },
            ToolSpec {
                name: "list_notes".into(),
                description: "Liste toutes les notes.".into(),
                input_schema: json!({ "type": "object", "properties": {} }),
            },
            ToolSpec {
                name: "search_notes".into(),
                description: "Recherche des notes par contenu (FTS). `query` obligatoire.".into(),
                input_schema: json!({ "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] }),
            },
            ToolSpec {
                name: "create_note".into(),
                description: "Crée une note (`title` et `content` optionnels).".into(),
                input_schema: json!({ "type": "object", "properties": { "title": { "type": "string" }, "content": { "type": "string" } } }),
            },
            ToolSpec {
                name: "list_journal".into(),
                description: "Liste les entrées de journal d'un jour. `date` (YYYY-MM-DD) obligatoire.".into(),
                input_schema: json!({ "type": "object", "properties": { "date": { "type": "string" } }, "required": ["date"] }),
            },
            ToolSpec {
                name: "create_journal_entry".into(),
                description: "Crée une entrée de journal (`target_day` YYYY-MM-DD et `content` obligatoires).".into(),
                input_schema: json!({ "type": "object", "properties": { "target_day": { "type": "string" }, "content": { "type": "string" } }, "required": ["target_day", "content"] }),
            },
            ToolSpec {
                name: "update_journal_entry".into(),
                description: "Met à jour une entrée de journal (`id` + champs partiels).".into(),
                input_schema: json!({ "type": "object", "properties": { "id": { "type": "string" }, "target_day": { "type": "string" }, "content": { "type": "string" } }, "required": ["id"] }),
            },
            ToolSpec {
                name: "delete_journal_entry".into(),
                description: "Supprime une entrée de journal. `id` obligatoire.".into(),
                input_schema: json!({ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }),
            },
        ]
    }
}

fn args_opt_string(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(str::to_string)
}

fn args_opt_priority(args: &Value, key: &str) -> Option<crate::models::Priority> {
    match args.get(key).and_then(Value::as_str).unwrap_or("normal") {
        "low" => Some(crate::models::Priority::Low),
        "high" => Some(crate::models::Priority::High),
        _ => Some(crate::models::Priority::Normal),
    }
}

fn parse_status(s: Option<&str>) -> Result<Option<crate::models::TodoStatus>, String> {
    match s {
        None => Ok(None),
        Some("pending") => Ok(Some(crate::models::TodoStatus::Pending)),
        Some("completed") => Ok(Some(crate::models::TodoStatus::Completed)),
        Some("cancelled") => Ok(Some(crate::models::TodoStatus::Cancelled)),
        Some(other) => Err(format!("statut inconnu : {other}")),
    }
}

impl ToolExecutor for DbExecutor {
    fn tools(&self) -> Vec<ToolSpec> {
        Self::tools()
    }

    fn call<'a>(
        &'a self,
        tool: &'a str,
        arguments: Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>>
    {
        use crate::db;
        use crate::models::{CreateJournalEntry, CreateNote, UpdateJournalEntry, UpdateTodo};

        Box::pin(async move {
            match tool {
                "list_todos" => {
                    let todos = match arguments.get("date").and_then(Value::as_str) {
                        Some(date) if !date.is_empty() => db::list_by_date(&self.pool, date).await.map_err(sqlx_err)?,
                        _ => db::list_all(&self.pool).await.map_err(sqlx_err)?,
                    };
                    let mut todos = todos;
                    if let Some(status) = parse_status(arguments.get("status").and_then(Value::as_str))? {
                        todos.retain(|t| {
                            serde_json::to_value(t.status).map(|v| v == json!(status)).unwrap_or(false)
                        });
                    }
                    Ok(serde_json::to_value(todos).map_err(|e| e.to_string())?)
                }
            "create_todo" => {
                let todo = db::create(&self.pool, Self::todo(&arguments)).await.map_err(sqlx_err)?;
                self.emit(crate::commands::TODOS_CHANGED);
                Ok(serde_json::to_value(todo).map_err(|e| e.to_string())?)
            }
            "update_todo" => {
                let id = required_id(&arguments)?;
                let status = parse_status(arguments.get("status").and_then(Value::as_str))?;
                let priority = arguments.get("priority").and_then(Value::as_str)
                    .and_then(|p| match p { "low" => Some(crate::models::Priority::Low), "high" => Some(crate::models::Priority::High), _ => Some(crate::models::Priority::Normal) });
                let update = UpdateTodo {
                    text: args_opt_string(&arguments, "text"),
                    note: args_double_opt(&arguments, "note"),
                    priority,
                    status,
                    scheduled_for: args_double_opt(&arguments, "scheduled_for"),
                    due_date: args_double_opt(&arguments, "due_date"),
                    remind_at: args_double_opt(&arguments, "remind_at"),
                    project_id: args_double_opt(&arguments, "project_id"),
                    area_id: args_double_opt(&arguments, "area_id"),
                    ..Default::default()
                };
                let todo = db::update(&self.pool, &id, update).await.map_err(sqlx_err)?;
                self.emit(crate::commands::TODOS_CHANGED);
                Ok(serde_json::to_value(todo).map_err(|e| e.to_string())?)
            }
            "toggle_todo" => {
                let id = required_id(&arguments)?;
                let todo = db::toggle(&self.pool, &id).await.map_err(sqlx_err)?;
                self.emit(crate::commands::TODOS_CHANGED);
                Ok(serde_json::to_value(todo).map_err(|e| e.to_string())?)
            }
            "delete_todo" => {
                let id = required_id(&arguments)?;
                db::delete(&self.pool, &id).await.map_err(sqlx_err)?;
                self.emit(crate::commands::TODOS_CHANGED);
                Ok(json!({ "deleted": true }))
            }
            "list_notes" => {
                let notes = db::list_notes(&self.pool).await.map_err(sqlx_err)?;
                Ok(serde_json::to_value(notes).map_err(|e| e.to_string())?)
            }
            "search_notes" => {
                let query = required_str(&arguments, "query")?;
                let notes = db::search_notes(&self.pool, &query).await.map_err(sqlx_err)?;
                Ok(serde_json::to_value(notes).map_err(|e| e.to_string())?)
            }
            "create_note" => {
                let note = db::create_note(
                    &self.pool,
                    CreateNote {
                        title: args_opt_string(&arguments, "title"),
                        content: args_opt_string(&arguments, "content"),
                    },
                )
                .await
                .map_err(sqlx_err)?;
                self.emit(crate::commands::NOTES_CHANGED);
                Ok(serde_json::to_value(note).map_err(|e| e.to_string())?)
            }
            "list_journal" => {
                let date = required_str(&arguments, "date")?;
                let entries = db::list_journal_entries_for_day(&self.pool, &date).await.map_err(sqlx_err)?;
                Ok(serde_json::to_value(entries).map_err(|e| e.to_string())?)
            }
            "create_journal_entry" => {
                let entry = db::create_journal_entry(
                    &self.pool,
                    CreateJournalEntry {
                        target_day: required_str(&arguments, "target_day")?,
                        content: required_str(&arguments, "content")?,
                        // L'agent ecrit toujours maintenant : la scission est
                        // un geste d'edition, pas une commande.
                        written_at: None,
                    },
                )
                .await
                .map_err(sqlx_err)?;
                self.emit(crate::commands::JOURNAL_CHANGED);
                Ok(serde_json::to_value(entry).map_err(|e| e.to_string())?)
            }
            "update_journal_entry" => {
                let id = required_id(&arguments)?;
                let entry = db::update_journal_entry(
                    &self.pool,
                    &id,
                    UpdateJournalEntry {
                        target_day: args_opt_string(&arguments, "target_day"),
                        content: args_opt_string(&arguments, "content"),
                    },
                )
                .await
                .map_err(sqlx_err)?;
                self.emit(crate::commands::JOURNAL_CHANGED);
                Ok(serde_json::to_value(entry).map_err(|e| e.to_string())?)
            }
            "delete_journal_entry" => {
                let id = required_id(&arguments)?;
                db::delete_journal_entry(&self.pool, &id).await.map_err(sqlx_err)?;
                self.emit(crate::commands::JOURNAL_CHANGED);
                Ok(json!({ "deleted": true }))
            }
            other => Err(format!("outil inconnu : {other}")),
            }
        })
    }
}

fn sqlx_err(e: sqlx::Error) -> String {
    e.to_string()
}

fn required_id(args: &Value) -> Result<String, String> {
    required_str(args, "id")
}

fn required_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("paramètre `{key}` manquant ou vide"))
}

/// `double_option` : un `null` explicite devient `Some(None)` (efface le
/// champ), un champ absent reste `None` (ne pas toucher).
fn args_double_opt(args: &Value, key: &str) -> Option<Option<String>> {
    match args.get(key) {
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) => Some(Some(s.clone())),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Protocole JSON-RPC 2.0 / MCP (pur : testable sans réseau ni CLI)
// ---------------------------------------------------------------------------

fn initialized_result() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "listik", "version": env!("CARGO_PKG_VERSION") },
        "instructions": "Tu es l'assistant de Listik. Utilise les outils pour lire ou modifier les données avant de répondre. Si une action est ambigüe (introuvable, exemple trop large), réponds que tu n'es pas sûr au lieu d'inventer."
    })
}

/// Traite une MESSAGE MCP (une ligne JSON-RPC) et renvoie la réponse à écrire.
/// `None` = rien à répondre (notification, requête invalide).
pub async fn handle_message(
    executor: &dyn ToolExecutor,
    raw: &str,
) -> Option<String> {
    let msg: Value = serde_json::from_str(raw.trim()).ok()?;
    let id = msg.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = msg.get("method").and_then(Value::as_str) else {
        return None; // parse trouble : on ignore
    };
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    eprintln!("[mcp] <- {method} (id={id})");

    // Les notifications n'ont pas d'id → jamais de réponse.
    if id.is_null() {
        return None;
    }

    let body = match method {
        "initialize" => success(id.clone(), initialized_result()), // capabilities+protocol
        "tools/list" => {
            let tools: Vec<Value> = executor.tools().iter().map(ToolSpec::to_mcp).collect();
            success(id, json!({ "tools": tools }))
        }
        "tools/call" => {
            let name = params.pointer("/name").and_then(Value::as_str).unwrap_or("");
            let arguments = params.pointer("/arguments").cloned().unwrap_or(Value::Null);
            match executor.call(name, arguments).await {
                Ok(result) => success(
                    id,
                    json!({ "content": [{ "type": "text", "text": result.to_string() }], "isError": false }),
                ),
                Err(err) => success(
                    id,
                    json!({ "content": [{ "type": "text", "text": err }], "isError": true }),
                ),
            }
        }
        "ping" => success(id, Value::Null),
        other => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": format!("méthode inconnue : {other}") }
        }),
    };
    Some(body.to_string())
}

fn success<'a>(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

// ---------------------------------------------------------------------------
// Transport HTTP (streamable MCP) — in-process, loopback
// ---------------------------------------------------------------------------

async fn handle_http(
    State(executor): State<Arc<dyn ToolExecutor>>,
    body: axum::body::Bytes,
) -> Response {
    let raw = String::from_utf8_lossy(&body).to_string();
    // Spec MCP Streamable HTTP : une entrée qui ne contient que des
    // notifications (pas d'id, donc pas de réponse) doit recevoir 202
    // Accepted — un 204 (utilisé avant ce correctif) fait échouer la
    // négociation chez certains clients stricts, qui abandonnent alors
    // silencieusement la connexion au serveur (constaté : `notifications/
    // initialized` en 204 => le CLI ne voit ensuite plus aucun outil).
    let mut resp = match handle_message(executor.as_ref(), &raw).await {
        Some(reply) => (StatusCode::OK, reply).into_response(),
        None => StatusCode::ACCEPTED.into_response(),
    };
    if resp.status() == StatusCode::OK {
        resp.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
    }
    resp
}

async fn health() -> Response {
    let mut resp = (StatusCode::OK, r#"{"ok":true}"#).into_response();
    resp.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        "application/json".parse().unwrap(),
    );
    resp
}

fn build_app(executor: Arc<dyn ToolExecutor>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/mcp", post(handle_http))
        .with_state(executor)
}

/// Démarre le serveur MCP sur un port libre du loopback (plage MCP_PORT_RANGE_START
/// …+20) et renvoie `(port, task). Le task fuit jusqu'à l'arrêt de l'app.
pub fn spawn_mcp_server(executor: Arc<dyn ToolExecutor>) -> Result<u16, String> {
    let mut port = MCP_PORT_RANGE_START;
    loop {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        // `TcpListener::from_std` exige un socket déjà en mode non-bloquant :
        // sans `set_nonblocking(true)`, le listener converti accepte bien la
        // poignée de main TCP côté OS mais la boucle d'accept async de tokio
        // (IOCP sous Windows) ne le sert jamais — la connexion reste ouverte
        // sans qu'aucun octet ne circule. Bug réel, constaté par un `curl`
        // qui restait pendu indéfiniment sur `/health` malgré un port bindé.
        let bound = std::net::TcpListener::bind(&addr).and_then(|std_listener| {
            std_listener.set_nonblocking(true)?;
            Ok(std_listener)
        });
        let Ok(std_listener) = bound else {
            port += 1;
            if port > MCP_PORT_RANGE_START + 20 {
                return Err("plus de ports libres pour le serveur MCP".to_string());
            }
            continue;
        };

        // `TcpListener::from_std` doit enregistrer le socket auprès du
        // reactor tokio — `setup()` de Tauri tourne sur un thread qui n'a
        // *aucun* runtime tokio ambiant, d'où « there is no reactor
        // running » en lançant la vraie app (jamais vu en test : les tests
        // tournent déjà dans un runtime). `block_on` fait entrer le runtime
        // géré par Tauri (même `RUNTIME` que `spawn` juste après) le temps
        // de la conversion.
        let listener = match tauri::async_runtime::block_on(async {
            TcpListener::from_std(std_listener)
        }) {
            Ok(l) => l,
            Err(_) => {
                port += 1;
                if port > MCP_PORT_RANGE_START + 20 {
                    return Err("plus de ports libres pour le serveur MCP".to_string());
                }
                continue;
            }
        };

        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, build_app(executor)).await;
        });
        return Ok(port);
    }
}

// ---------------------------------------------------------------------------
// Localisation + invocation du CLI
// ---------------------------------------------------------------------------

/// Trouve le binaire `claude` (initial) sur cette machine.
#[cfg(windows)]
pub fn resolve_claude_binary() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("claude"),
        PathBuf::from(std::env::var("USERPROFILE").ok()?).join(".local\\bin\\claude.exe"),
        PathBuf::from(std::env::var("USERPROFILE").ok()?).join(".claude\\claude.exe"),
        PathBuf::from(std::env::var("LOCALAPPDATA").ok()?).join("Programs\\claude\\claude.exe"),
    ];
    candidates.into_iter().find(|p| {
        if p.file_name() == Some(std::ffi::OsStr::new("claude")) {
            std::process::Command::new(p).arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
        } else {
            p.is_file()
        }
    })
}

#[cfg(not(windows))]
pub fn resolve_claude_binary() -> Option<PathBuf> {
    Some(PathBuf::from("claude"))
}

/// Écrit le fichier mcp.json temporaire qui pointe vers notre serveur HTTP.
pub struct McpConfig {
    pub path: PathBuf,
}

impl McpConfig {
    pub fn write(port: u16) -> Result<Self, String> {
        let dir = std::env::temp_dir().join(format!("listik-mcp-{}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("mcp.json");
        let cfg = json!({
            "mcpServers": {
                "listik": { "type": "http", "url": format!("http://127.0.0.1:{port}/mcp") }
            }
        });
        std::fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap()).map_err(|e| e.to_string())?;
        Ok(Self { path })
    }
}

/// Un tour d'agent `claude -p`. Renvoie le texte final de la réponse.
/// `--output-format json` → blob structuré ; on extrait `message.content[].text`.
/// Le fichier `--mcp-config` est supprimé par l'appelant (guard/drop) ou à la fin.
pub async fn run_claude_turn(
    binary: &Path,
    prompt: &str,
    mcp_config: &McpConfig,
    timeout: std::time::Duration,
) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(binary);
    cmd.arg("-p")
        .arg(prompt)
        .arg("--output-format")
        .arg("json")
        .arg("--no-session-persistence")
        .arg("--strict-mcp-config")
        .arg("--mcp-config")
        .arg(&mcp_config.path)
        // Sans ça, le CLI headless REFUSE l'appel de nos outils MCP (pas de
        // TTY pour approuver) — constaté en test manuel : `tools/list` passe,
        // `tools/call` échoue avec « permission refusée ». `--strict-mcp-config`
        // limite déjà les SERVEURS à `listik` seul ; ce préfixe autorise tous
        // ses outils sans lister chaque nom un par un.
        .arg("--allowedTools")
        .arg("mcp__listik")
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true); // le child meurt si notre process meurt

    let Ok(child) = cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    else {
        return Err("impossible de lancer le CLI Claude".to_string());
    };

    // `kill_on_drop(true)` sur l'enfant ⇒ le Child est tué quand la future est
    // drop à l'expiration du délai, sans besoin de le tuer manuellement.
    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| format!("tour interrompu (délai {:.0?} dépassé)", timeout))?
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "le CLI Claude a échoué ({}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).chars().take(200).collect::<String>()
        ));
    }
    extract_json_result(&output.stdout)
}

/// Extrait le texte de réponse du blob JSON de `--output-format json`.
fn extract_json_result(stdout: &[u8]) -> Result<String, String> {
    let v: Value = serde_json::from_slice(stdout).map_err(|e| format!("sortie CLI non-JSON : {e}"))?;
    if v["is_error"].as_bool() == Some(true) {
        if let Some(err) = v["api_error_message"].as_str().or(v["error"].as_str()) {
            return Err(format!("erreur du CLI : {err}"));
        }
        return Err(format!("erreur du CLI : {}", v));
    }
    // `--output-format json` (`claude -p`) met le texte final dans un champ
    // `result` de premier niveau — PAS dans `message.content[]` (ça, c'est la
    // forme `stream-json`). Constaté sur de vrais appels : `{"is_error":false,
    // …,"result":"texte…", …}`, aucune clé `message` du tout.
    let text = v["result"].as_str().unwrap_or_default().to_string();
    if text.trim().is_empty() {
        // Aucune itération texte (ex. réponse vide)…
        return Err("le CLI n'a rien retourné".to_string());
    }
    Ok(text)
}

// ---------------------------------------------------------------------------
// R5 — Provider : trait qui abstrait le moteur d'agent plein texte. Le squelette
// R0 prenait un `&Path` de binaire ; ici on encapsule résolution + écriture du
// mcp.json + exécution, de sorte que Claude aujourd'hui, Gemini demain, offrent
// la même surface au reste de l'app.
// ---------------------------------------------------------------------------

/// Un moteur d'agent capable de traiter un prompt en accédant aux outils Listik
/// via le serveur MCP (port loopback). `run` est désucré en `Box::pin` pour
/// rester dyn-compatible, comme `ToolExecutor::call`.
pub trait AgentProvider: Send + Sync {
    fn name(&self) -> &str;
    fn run<'a>(
        &'a self,
        prompt: &'a str,
        mcp_port: u16,
        timeout: std::time::Duration,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>;
}

/// Fournisseur Claude Code (`claude -p … --mcp-config …`).
pub struct ClaudeProvider {
    binary: PathBuf,
}

impl ClaudeProvider {
    pub fn new(binary: PathBuf) -> Self {
        Self { binary }
    }

    /// Résout le binaire `claude` sur cette machine, sinon une erreur claire.
    pub fn resolve() -> Result<Self, String> {
        resolve_claude_binary()
            .map(Self::new)
            .ok_or_else(|| "binaire `claude` introuvable (Claude Code est-il installé ?)".to_string())
    }
}

impl AgentProvider for ClaudeProvider {
    fn name(&self) -> &str {
        "claude"
    }

    fn run<'a>(
        &'a self,
        prompt: &'a str,
        mcp_port: u16,
        timeout: std::time::Duration,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>
    {
        Box::pin(async move {
            let config = McpConfig::write(mcp_port)?;
            let res = run_claude_turn(&self.binary, prompt, &config, timeout).await;
            let _ = std::fs::remove_file(&config.path);
            res
        })
    }
}

// ---------------------------------------------------------------------------
// Fournisseur OpenCode (`opencode run … --dir … --format json`). Contrairement
// à Claude Code (--mcp-config = un fichier, une exécution), OpenCode enregistre
// ses serveurs MCP dans un opencode.jsonc (config globale OU projet, la config
// projet a priorité) — on écrit un dossier temporaire jetable avec son propre
// opencode.jsonc pointant sur notre serveur, jamais touché au fichier global de
// l'utilisateur. Vérifié en conditions réelles (round-trip lecture + le CLI
// appelle bien l'outil, pas juste le décrit).
// ---------------------------------------------------------------------------

/// Dossier projet jetable contenant le `opencode.jsonc` d'un tour.
pub struct OpenCodeProjectDir {
    pub path: PathBuf,
}

impl OpenCodeProjectDir {
    pub fn write(port: u16) -> Result<Self, String> {
        let dir = std::env::temp_dir().join(format!("listik-opencode-{}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let cfg = json!({
            "$schema": "https://opencode.ai/config.json",
            "mcp": {
                "listik": {
                    "type": "remote",
                    "url": format!("http://127.0.0.1:{port}/mcp"),
                    "enabled": true
                }
            }
        });
        std::fs::write(dir.join("opencode.jsonc"), serde_json::to_string_pretty(&cfg).unwrap())
            .map_err(|e| e.to_string())?;
        Ok(Self { path: dir })
    }
}

/// Trouve le binaire `opencode` sur cette machine (wrapper npm `.cmd` sous
/// Windows — la résolution PATH+PATHEXT de `Command` le gère nativement,
/// pas besoin de passer par `cmd /c`).
pub fn resolve_opencode_binary() -> Option<PathBuf> {
    // `Command::new` (CreateProcess direct, sans passer par un shell) résout
    // automatiquement `.exe` par nom nu, mais PAS `.cmd`/`.bat` — contrairement
    // à Claude Code (un vrai `claude.exe`), OpenCode s'installe via npm comme
    // un wrapper `.cmd` (confirmé sur cette machine : bare "opencode" échoue
    // avec NotFound, "opencode.cmd" fonctionne).
    #[cfg(windows)]
    let candidates = ["opencode.cmd", "opencode.exe", "opencode"];
    #[cfg(not(windows))]
    let candidates = ["opencode"];

    candidates.into_iter().map(PathBuf::from).find(|p| {
        std::process::Command::new(p)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

/// Un tour `opencode run`. `--format json` produit un flux NDJSON (une ligne
/// = un événement `step_start`/`tool_use`/`text`/`step_finish`) — pas un
/// blob JSON unique comme Claude. Le texte final est la concaténation des
/// événements `type: "text"`, dans l'ordre.
pub async fn run_opencode_turn(
    binary: &Path,
    prompt: &str,
    project_dir: &Path,
    timeout: std::time::Duration,
) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(binary);
    cmd.arg("run")
        .arg(prompt)
        .arg("--dir")
        .arg(project_dir)
        .arg("--format")
        .arg("json")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let Ok(child) = cmd.spawn() else {
        return Err("impossible de lancer le CLI OpenCode".to_string());
    };

    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| format!("tour interrompu (délai {:.0?} dépassé)", timeout))?
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "le CLI OpenCode a échoué ({}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).chars().take(200).collect::<String>()
        ));
    }
    extract_opencode_text(&output.stdout)
}

/// Concatène le texte de tous les événements `type: "text"` du flux NDJSON.
fn extract_opencode_text(stdout: &[u8]) -> Result<String, String> {
    let mut parts = Vec::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if v["type"] == "text" {
            if let Some(t) = v["part"]["text"].as_str() {
                parts.push(t.to_string());
            }
        }
    }
    if parts.is_empty() {
        return Err("le CLI n'a rien retourné".to_string());
    }
    Ok(parts.join("\n"))
}

pub struct OpenCodeProvider {
    binary: PathBuf,
}

impl OpenCodeProvider {
    pub fn new(binary: PathBuf) -> Self {
        Self { binary }
    }

    /// Résout le binaire `opencode` sur cette machine, sinon une erreur claire.
    pub fn resolve() -> Result<Self, String> {
        resolve_opencode_binary()
            .map(Self::new)
            .ok_or_else(|| "binaire `opencode` introuvable (OpenCode est-il installé ?)".to_string())
    }
}

impl AgentProvider for OpenCodeProvider {
    fn name(&self) -> &str {
        "opencode"
    }

    fn run<'a>(
        &'a self,
        prompt: &'a str,
        mcp_port: u16,
        timeout: std::time::Duration,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>
    {
        Box::pin(async move {
            let project = OpenCodeProjectDir::write(mcp_port)?;
            let res = run_opencode_turn(&self.binary, prompt, &project.path, timeout).await;
            let _ = std::fs::remove_dir_all(&project.path);
            res
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn echo() -> EchoExecutor {
        EchoExecutor
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn initialize_renvoie_une_capacite_tools() {
        let reply = handle_message(&echo(), r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}"#)
            .await
            .unwrap();
        let v: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(v["result"]["protocolVersion"], MCP_PROTOCOL_VERSION);
        assert_eq!(v["result"]["capabilities"]["tools"], json!({}));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tools_list_expose_echo() {
        let reply = handle_message(
            &echo(),
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
        )
        .await
        .unwrap();
        let v: Value = serde_json::from_str(&reply).unwrap();
        let tools = v["result"]["tools"].as_array().unwrap();
        assert_eq!(tools[0]["name"], "echo");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tools_call_echo_renvoie_la_valeur() {
        let request = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"text":"bonjour"}}}"#;
        let reply = handle_message(&echo(), request).await.unwrap();
        let v: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(v["result"]["isError"], false);
        assert!(v["result"]["content"][0]["text"].as_str().unwrap().contains("bonjour"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn outils_inconnu_renvoie_iserror() {
        let request = r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nope","arguments":{}}}"#;
        let reply = handle_message(&echo(), request).await.unwrap();
        let v: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(v["result"]["isError"], true);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn notification_sans_rep_ite() {
        let request = r#"{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}"#;
        assert!(handle_message(&echo(), request).await.is_none());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn methode_inconnue_erreur_jsonrpc() {
        let request = r#"{"jsonrpc":"2.0","id":5,"method":"foo","params":{}}"#;
        let reply = handle_message(&echo(), request).await.unwrap();
        let v: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(v["error"]["code"], -32601);
    }

    /// Pool SQLite en mémoire (une seule connexion → même base pour tous).
    async fn mem_pool() -> sqlx::SqlitePool {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn db_executor_cree_lit_toggle_supprime() {
        let executor = DbExecutor::new(mem_pool().await, None);

        let created = executor
            .call("create_todo", json!({ "text": "acheter du pain", "priority": "high" }))
            .await
            .unwrap();
        assert_eq!(created["text"], "acheter du pain");
        assert_eq!(created["priority"], "high");
        let id = created["id"].as_str().unwrap().to_string();

        let list = executor.call("list_todos", json!({})).await.unwrap();
        assert_eq!(list.as_array().unwrap().len(), 1);

        let toggled = executor.call("toggle_todo", json!({ "id": id })).await.unwrap();
        assert_eq!(toggled["status"], "completed");

        let done = executor.call("delete_todo", json!({ "id": id })).await.unwrap();
        assert_eq!(done["deleted"], true);
        let list = executor.call("list_todos", json!({})).await.unwrap();
        assert_eq!(list.as_array().unwrap().len(), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn db_executor_creer_un_bloc_journal() {
        let executor = DbExecutor::new(mem_pool().await, None);

        let entry = executor
            .call(
                "create_journal_entry",
                json!({ "target_day": "2026-08-10", "content": "premier bloc" }),
            )
            .await
            .unwrap();
        assert_eq!(entry["target_day"], "2026-08-10");

        let list = executor
            .call("list_journal", json!({ "date": "2026-08-10" }))
            .await
            .unwrap();
        assert_eq!(list.as_array().unwrap().len(), 1);

        let no_date = executor.call("list_journal", json!({})).await;
        assert!(no_date.is_err(), "date manquante doit être une erreur");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn db_executor_outil_inconnu_est_une_erreur() {
        let executor = DbExecutor::new(mem_pool().await, None);
        let res = executor.call("iam_inventer_une_planete", json!({})).await;
        assert!(res.is_err());
    }

    /// Fournisseur factice pour valider le contrat du trait (object safety,
    /// désucrage async) sans dépendre d'un binaire `claude`.
    struct FakeProvider;

    impl AgentProvider for FakeProvider {
        fn name(&self) -> &str {
            "fake"
        }

        fn run<'a>(
            &'a self,
            prompt: &'a str,
            _mcp_port: u16,
            _timeout: std::time::Duration,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>
        {
            Box::pin(async move { Ok(format!("[{}] {}", self.name(), prompt)) })
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn le_trait_provider_est_consommable_en_dyn() {
        let provider: std::sync::Arc<dyn AgentProvider> = std::sync::Arc::new(FakeProvider);
        assert_eq!(provider.name(), "fake");
        let answer = provider
            .run("audite ma base", 0, std::time::Duration::from_secs(1))
            .await
            .unwrap();
        assert_eq!(answer, "[fake] audite ma base");
    }

    /// Régression : le texte final vit dans `result` (premier niveau), pas
    /// dans `message.content[]` — bug réel constaté en test manuel (un vrai
    /// tour réussi remontait quand même « le CLI n'a rien retourné »).
    /// Blob raccourci mais authentique, capturé sur un vrai `claude -p
    /// --output-format json`.
    #[test]
    fn extract_json_result_lit_le_champ_result() {
        let stdout = r#"{"is_error":false,"duration_api_ms":31944,"num_turns":7,
            "stop_reason":"end_turn","session_id":"afbdec3d","subtype":"success",
            "api_error_status":null,"result":"Bonjour, voici la reponse."}"#
        .as_bytes();
        assert_eq!(extract_json_result(stdout).unwrap(), "Bonjour, voici la reponse.");
    }

    #[test]
    fn extract_json_result_remonte_lerreur_api() {
        let stdout = r#"{"is_error":true,"api_error_message":"quota depasse","result":""}"#.as_bytes();
        let err = extract_json_result(stdout).unwrap_err();
        assert!(err.contains("quota depasse"), "erreur inattendue : {err}");
    }

    #[test]
    fn mote_claude_resout_le_binaire_sans_crasher() {
        // Ne requiert PAS le binaire : teste la surface `resolve()` dans les
        // deux cas (présent → Ok ; absent → erreur lisible, pas de panique).
        match ClaudeProvider::resolve() {
            Ok(p) => {
                assert_eq!(p.name(), "claude");
                assert!(p.binary.exists() || p.binary.file_name() == Some(std::ffi::OsStr::new("claude")));
            }
            Err(e) => assert!(e.contains("claude"), "erreur peu claire : {e}"),
        }
    }

    /// Vérification du critère d'acceptation R0 (jamais exécutée pour de vrai
    /// jusqu'ici : les 14 tests protocole ci-dessus tapent `EchoExecutor`/pools
    /// en mémoire, jamais le VRAI binaire `claude`). Coûte un appel API réel
    /// (abonnement) et du réseau → ignorée par défaut.
    ///
    /// `#[test]` + runtime manuel (PAS `#[tokio::test]`) : reproduit la vraie
    /// forme d'appel de production (`setup()` de Tauri, synchrone, hors de
    /// tout contexte async actif). Appeler `spawn_mcp_server` depuis un
    /// `#[tokio::test]` déjà actif panique parfois (« cannot start a runtime
    /// from within a runtime », non déterministe selon le thread qui exécute
    /// le poll) — constaté en écrivant le test OpenCode ci-dessous, qui
    /// partage le même appel. Pas un bug de prod (le vrai `pnpm tauri dev`
    /// l'a confirmé), juste la mauvaise forme de test.
    /// `cargo test cli_agent::tests::vrai_round_trip -- --ignored --nocapture`
    #[test]
    #[ignore = "appelle le vrai binaire claude (réseau + abonnement)"]
    fn vrai_round_trip_claude_appelle_list_todos_via_mcp() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _guard = rt.enter();

        let executor = rt.block_on(async {
            let pool = mem_pool().await;
            let executor = std::sync::Arc::new(DbExecutor::new(pool, None)) as Arc<dyn ToolExecutor>;
            executor
                .call("create_todo", json!({ "text": "acheter des kiwis violets" }))
                .await
                .unwrap();
            executor
        });

        let port = spawn_mcp_server(executor).expect("le serveur MCP doit démarrer");
        let provider = ClaudeProvider::resolve().expect("binaire claude introuvable");

        let answer = rt
            .block_on(provider.run(
                "Utilise l'outil list_todos pour lister mes tâches en attente, \
                 puis cite le texte exact de chacune dans ta réponse.",
                port,
                std::time::Duration::from_secs(60),
            ))
            .expect("le tour d'agent a échoué");

        assert!(
            answer.to_lowercase().contains("kiwis violets"),
            "la réponse ne cite pas la tâche seedée (l'outil MCP n'a probablement pas été \
             appelé) : {answer}"
        );
    }

    /// Le test ci-dessus ne couvre qu'un outil de LECTURE (`list_todos`).
    /// `--allowedTools "mcp__listik"` (préfixe serveur) doit aussi couvrir
    /// les MUTATIONS (`create_todo`) — sinon l'Assistant refuserait en
    /// silence toute écriture en prod alors que la lecture marche. Vérifié
    /// sur l'état réel de la base, pas seulement le texte de la réponse.
    #[test]
    #[ignore = "appelle le vrai binaire claude (réseau + abonnement)"]
    fn vrai_round_trip_claude_peut_creer_une_tache_via_mcp() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _guard = rt.enter();

        let pool = rt.block_on(mem_pool());
        let executor = std::sync::Arc::new(DbExecutor::new(pool.clone(), None)) as Arc<dyn ToolExecutor>;

        let port = spawn_mcp_server(executor).expect("le serveur MCP doit démarrer");
        let provider = ClaudeProvider::resolve().expect("binaire claude introuvable");

        rt.block_on(provider.run(
            "Utilise l'outil create_todo pour créer une tâche avec le texte \
             exact : tester la permission mutation mcp",
            port,
            std::time::Duration::from_secs(60),
        ))
        .expect("le tour d'agent a échoué");

        let todos = rt.block_on(crate::db::list_all(&pool)).unwrap();
        assert!(
            todos.iter().any(|t| t.text == "tester la permission mutation mcp"),
            "la tâche n'a pas été créée en base — la mutation a probablement été refusée : {:?}",
            todos.iter().map(|t| &t.text).collect::<Vec<_>>()
        );
    }

    /// Miroir du round-trip Claude ci-dessus, pour OpenCode : vérifié en
    /// conditions réelles avant d'écrire ce test (le CLI ne fait pas que
    /// décrire les outils dispos, il faut un prompt explicite pour qu'il
    /// appelle vraiment `listik_list_todos` plutôt que de le paraphraser).
    #[test]
    #[ignore = "appelle le vrai binaire opencode (réseau + abonnement)"]
    fn vrai_round_trip_opencode_appelle_list_todos_via_mcp() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _guard = rt.enter();

        let executor = rt.block_on(async {
            let pool = mem_pool().await;
            let executor = std::sync::Arc::new(DbExecutor::new(pool, None)) as Arc<dyn ToolExecutor>;
            executor
                .call("create_todo", json!({ "text": "acheter des kiwis violets" }))
                .await
                .unwrap();
            executor
        });

        let port = spawn_mcp_server(executor).expect("le serveur MCP doit démarrer");
        let provider = OpenCodeProvider::resolve().expect("binaire opencode introuvable");

        let answer = rt
            .block_on(provider.run(
                "Appelle maintenant l'outil listik_list_todos (tool call réel, pas une \
                 description), puis cite le texte exact des tâches retournées.",
                port,
                std::time::Duration::from_secs(60),
            ))
            .expect("le tour d'agent a échoué");

        assert!(
            answer.to_lowercase().contains("kiwis violets"),
            "la réponse ne cite pas la tâche seedée (l'outil MCP n'a probablement pas été \
             appelé) : {answer}"
        );
    }

    #[test]
    fn resolution_opencode_ne_crashe_pas_sans_le_binaire() {
        match OpenCodeProvider::resolve() {
            Ok(p) => assert_eq!(p.name(), "opencode"),
            Err(e) => assert!(e.contains("opencode"), "erreur peu claire : {e}"),
        }
    }

    #[test]
    fn extract_opencode_text_concatene_les_evenements_text() {
        let stdout = concat!(
            r#"{"type":"step_start","part":{}}"#,
            "\n",
            r#"{"type":"tool_use","part":{"text":"ignore-moi"}}"#,
            "\n",
            r#"{"type":"text","part":{"text":"premiere partie"}}"#,
            "\n",
            r#"{"type":"text","part":{"text":"deuxieme partie"}}"#,
            "\n",
        )
        .as_bytes();
        let text = extract_opencode_text(stdout).unwrap();
        assert_eq!(text, "premiere partie\ndeuxieme partie");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn serveur_repond_health() {
        let port = start_server().await;
        let body = http_body(port, "GET", "/health", "").await.unwrap();
        assert!(body.contains(r#"{"ok":true}"#), "réponse inattendue : {body}");
    }

    /// Régression : `bind` échouait avec `?` au lieu de faire avancer la
    /// boucle → un port déjà occupé faisait échouer tout le démarrage au
    /// lieu d'essayer le suivant.
    #[test]
    fn spawn_mcp_server_essaie_le_port_suivant_si_le_premier_est_pris() {
        let _rt = tokio::runtime::Runtime::new().unwrap();
        let _guard = _rt.enter();

        let occupied = std::net::TcpListener::bind((
            "127.0.0.1",
            MCP_PORT_RANGE_START,
        ))
        .unwrap();

        let port = spawn_mcp_server(Arc::new(EchoExecutor) as Arc<dyn ToolExecutor>).unwrap();

        assert_ne!(port, MCP_PORT_RANGE_START, "aurait dû sauter le port occupé");
        drop(occupied);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn serveur_mcp_repond_initialize() {
        let port = start_server().await;
        let body = http_body(
            port,
            "POST",
            "/mcp",
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}"#,
        )
        .await
        .unwrap();
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["result"]["serverInfo"]["name"], "listik");
        assert_eq!(v["result"]["protocolVersion"], MCP_PROTOCOL_VERSION);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn serveur_mcp_repond_tools_call() {
        let port = start_server().await;
        let body = http_body(
            port,
            "POST",
            "/mcp",
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"via http"}}}"#,
        )
        .await
        .unwrap();
        let v: Value = serde_json::from_str(&body).unwrap();
        assert!(v["result"]["content"][0]["text"].as_str().unwrap().contains("via http"));
    }

    /// Démarre le serveur axum de test et renvoie son port.
    async fn start_server() -> u16 {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let app = build_app(Arc::new(EchoExecutor) as Arc<dyn ToolExecutor>);
            let _ = axum::serve(listener, app).await;
        });
        tokio::task::yield_now().await;
        port
    }

    /// Envoie une requête HTTP brute et renvoie le corps de la réponse.
    async fn http_body(port: u16, method: &str, path: &str, body: &str) -> Result<String, String> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let mut client = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .map_err(|e| e.to_string())?;
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        client
            .write_all(request.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        let mut raw = Vec::new();
        client.read_to_end(&mut raw).await.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&raw).to_string();
        text.split_once("\r\n\r\n")
            .map(|(_, b)| b.to_string())
            .ok_or(text)
    }

    /// Envoie une requête HTTP brute et renvoie le code de statut.
    async fn http_status(port: u16, method: &str, path: &str, body: &str) -> u16 {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let mut client = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        client.write_all(request.as_bytes()).await.unwrap();
        let mut raw = Vec::new();
        client.read_to_end(&mut raw).await.unwrap();
        let text = String::from_utf8_lossy(&raw).to_string();
        text.lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|code| code.parse().ok())
            .unwrap_or(0)
    }

    /// Régression : une entrée qui ne contient qu'une notification (pas
    /// d'id → pas de réponse JSON-RPC) doit recevoir 202 Accepted, le code
    /// attendu par la spec MCP Streamable HTTP. Un 204 (comportement avant
    /// ce correctif) a fait échouer silencieusement le handshake avec le
    /// vrai CLI `claude` : `notifications/initialized` recevait 204, le
    /// client abandonnait la connexion, et aucun outil `listik` n'était
    /// plus jamais visible ensuite (constaté en test manuel, pas seulement
    /// théorique).
    #[tokio::test(flavor = "multi_thread")]
    async fn notification_recoit_202_accepted_pas_204() {
        let port = start_server().await;
        let status = http_status(
            port,
            "POST",
            "/mcp",
            r#"{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}"#,
        )
        .await;
        assert_eq!(status, 202, "une notification doit recevoir 202 Accepted");
    }
}