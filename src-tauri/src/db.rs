use crate::models::{
    Area, CreateArea, CreateNote, CreateProject, CreateSubTask, CreateTag, CreateTodo, Note,
    Project, Recurrence, Settings, SubTask, Tag, Todo, TodoStatus, UpdateArea, UpdateNote,
    UpdateProject, UpdateSettings, UpdateSubTask, UpdateTag, UpdateTodo,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// État partagé exposé aux commandes Tauri.
pub struct AppState {
    pub pool: SqlitePool,
}

const SELECT_COLUMNS: &str =
    "id, text, note, list, status, priority, recurrence, scheduled_for, due_date, remind_at, \
     project_id, area_id, heading_id, this_evening, someday, created_at, updated_at";

const NOTE_COLUMNS: &str = "id, title, content, pinned, created_at, updated_at";

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Crée (si besoin) le fichier SQLite dans le dossier de données de l'app,
/// ouvre un pool et applique les migrations embarquées.
pub async fn init_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("listik.db");

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(pool)
}

/// Peuple les relations hors-colonnes (`sub_tasks`, `tags`) de chaque tâche —
/// une requête par tâche et par relation (volumes personnels, coût négligeable).
///
/// Point de passage UNIQUE : toute lecture de `Todo` doit passer par ici, sinon
/// on renvoie des relations vides selon le chemin emprunté. C'est pourquoi `get`
/// l'appelle aussi, sur un vecteur d'un seul élément.
async fn attach_relations(pool: &SqlitePool, mut todos: Vec<Todo>) -> Result<Vec<Todo>, sqlx::Error> {
    for todo in &mut todos {
        todo.sub_tasks = list_subtasks(pool, &todo.id).await?;
        todo.tags = list_todo_tags(pool, &todo.id).await?;
    }
    Ok(todos)
}

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Todo>, sqlx::Error> {
    let query = format!("SELECT {SELECT_COLUMNS} FROM todos ORDER BY created_at DESC");
    let todos = sqlx::query_as::<_, Todo>(&query).fetch_all(pool).await?;
    attach_relations(pool, todos).await
}

pub async fn list_by_date(pool: &SqlitePool, date: &str) -> Result<Vec<Todo>, sqlx::Error> {
    let query =
        format!("SELECT {SELECT_COLUMNS} FROM todos WHERE scheduled_for = ? ORDER BY created_at DESC");
    let todos = sqlx::query_as::<_, Todo>(&query)
        .bind(date)
        .fetch_all(pool)
        .await?;
    attach_relations(pool, todos).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Todo>, sqlx::Error> {
    let query = format!("SELECT {SELECT_COLUMNS} FROM todos WHERE id = ?");
    let todo = sqlx::query_as::<_, Todo>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await?;
    match todo {
        // Passe par le helper commun plutôt que de ré-attacher à la main :
        // sinon ce chemin oublierait chaque nouvelle relation.
        Some(t) => Ok(attach_relations(pool, vec![t]).await?.into_iter().next()),
        None => Ok(None),
    }
}

pub async fn create(pool: &SqlitePool, input: CreateTodo) -> Result<Todo, sqlx::Error> {
    let now = now_iso();
    let todo = Todo {
        id: Uuid::new_v4().to_string(),
        text: input.text,
        note: input.note,
        list: input.list,
        status: TodoStatus::Pending,
        priority: input.priority.unwrap_or_default(),
        recurrence: input.recurrence.unwrap_or_default(),
        scheduled_for: input.scheduled_for,
        due_date: input.due_date,
        remind_at: input.remind_at,
        project_id: input.project_id,
        area_id: input.area_id,
        heading_id: input.heading_id,
        this_evening: input.this_evening,
        someday: input.someday,
        created_at: now.clone(),
        updated_at: now,
        sub_tasks: Vec::new(),
        // Rien ne peut être lié à la création : les tags passent par
        // `set_todo_tags`, seul écrivain de `task_tags`.
        tags: Vec::new(),
    };

    sqlx::query(
        "INSERT INTO todos (id, text, note, list, status, priority, recurrence, scheduled_for, due_date, remind_at, \
         project_id, area_id, heading_id, this_evening, someday, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&todo.id)
    .bind(&todo.text)
    .bind(&todo.note)
    .bind(&todo.list)
    .bind(todo.status)
    .bind(todo.priority)
    .bind(todo.recurrence)
    .bind(&todo.scheduled_for)
    .bind(&todo.due_date)
    .bind(&todo.remind_at)
    .bind(&todo.project_id)
    .bind(&todo.area_id)
    .bind(&todo.heading_id)
    .bind(todo.this_evening)
    .bind(todo.someday)
    .bind(&todo.created_at)
    .bind(&todo.updated_at)
    .execute(pool)
    .await?;

    Ok(todo)
}

pub async fn update(pool: &SqlitePool, id: &str, input: UpdateTodo) -> Result<Todo, sqlx::Error> {
    let now = now_iso();

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE todos SET ");
    let mut sep = qb.separated(", ");

    if let Some(text) = input.text {
        sep.push("text = ").push_bind_unseparated(text);
    }
    if let Some(note) = input.note {
        sep.push("note = ").push_bind_unseparated(note);
    }
    if let Some(list) = input.list {
        sep.push("list = ").push_bind_unseparated(list);
    }
    if let Some(priority) = input.priority {
        sep.push("priority = ").push_bind_unseparated(priority);
    }
    if let Some(recurrence) = input.recurrence {
        sep.push("recurrence = ").push_bind_unseparated(recurrence);
    }
    if let Some(status) = input.status {
        sep.push("status = ").push_bind_unseparated(status);
    }
    if let Some(scheduled_for) = input.scheduled_for {
        sep.push("scheduled_for = ").push_bind_unseparated(scheduled_for);
    }
    if let Some(due_date) = input.due_date {
        sep.push("due_date = ").push_bind_unseparated(due_date);
    }
    if let Some(remind_at) = input.remind_at {
        // Le rappel change → on réarme la notification (reminded remis à 0).
        sep.push("remind_at = ").push_bind_unseparated(remind_at);
        sep.push("reminded = ").push_bind_unseparated(0_i64);
    }
    if let Some(project_id) = input.project_id {
        sep.push("project_id = ").push_bind_unseparated(project_id);
    }
    if let Some(area_id) = input.area_id {
        sep.push("area_id = ").push_bind_unseparated(area_id);
    }
    if let Some(heading_id) = input.heading_id {
        sep.push("heading_id = ").push_bind_unseparated(heading_id);
    }
    if let Some(this_evening) = input.this_evening {
        sep.push("this_evening = ").push_bind_unseparated(this_evening);
    }
    if let Some(someday) = input.someday {
        sep.push("someday = ").push_bind_unseparated(someday);
    }
    sep.push("updated_at = ").push_bind_unseparated(now);
    // Contenu potentiellement modifié → à ré-indexer côté sidecar (D3).
    sep.push("needs_embedding = ").push_bind_unseparated(1_i64);

    qb.push(" WHERE id = ").push_bind(id);
    qb.build().execute(pool).await?;

    get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn toggle(pool: &SqlitePool, id: &str) -> Result<Todo, sqlx::Error> {
    let current = get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;

    // Tâche récurrente que l'on coche : on la reporte à la prochaine occurrence
    // (elle reste « à faire ») au lieu de la marquer terminée.
    if current.status == TodoStatus::Pending && current.recurrence != Recurrence::None {
        let base = current
            .scheduled_for
            .as_deref()
            .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
            .unwrap_or_else(|| chrono::Local::now().date_naive());

        if let Some(next) = current.recurrence.advance(base) {
            let next_str = next.format("%Y-%m-%d").to_string();
            // Décale le rappel de la même durée (conserve l'heure) et le réarme.
            let next_remind = current.remind_at.as_deref().and_then(|s| {
                chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
                    .ok()
                    .map(|dt| (dt + (next - base)).format("%Y-%m-%dT%H:%M").to_string())
            });
            sqlx::query(
                "UPDATE todos SET scheduled_for = ?, due_date = ?, remind_at = ?, reminded = 0, \
                 needs_embedding = 1, updated_at = ? WHERE id = ?",
            )
            .bind(&next_str)
            .bind(&next_str)
            .bind(&next_remind)
            .bind(now_iso())
            .bind(id)
            .execute(pool)
            .await?;
            return get(pool, id).await?.ok_or(sqlx::Error::RowNotFound);
        }
    }

    let new_status = current.status.toggled();
    sqlx::query("UPDATE todos SET status = ?, needs_embedding = 1, updated_at = ? WHERE id = ?")
        .bind(new_status)
        .bind(now_iso())
        .bind(id)
        .execute(pool)
        .await?;

    get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    // Pas de FK/cascade dans ce schéma → on nettoie les enfants à la main
    // (sous-tâches, liens de tags, ordre manuel) pour ne pas laisser d'orphelins.
    sqlx::query("DELETE FROM sub_tasks WHERE todo_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM task_tags WHERE todo_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM orderings WHERE todo_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM todos WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    queue_deindex(pool, id, "task").await
}

/// Tâches dont le rappel est dû : `remind_at` <= `now` (date-heure locale),
/// pas encore notifiées et toujours « à faire ». `now` doit être au même
/// format que `remind_at` (« YYYY-MM-DDTHH:MM ») pour une comparaison lexicale.
pub async fn due_reminders(pool: &SqlitePool, now: &str) -> Result<Vec<Todo>, sqlx::Error> {
    let query = format!(
        "SELECT {SELECT_COLUMNS} FROM todos \
         WHERE remind_at IS NOT NULL AND reminded = 0 AND status = 'pending' AND remind_at <= ? \
         ORDER BY remind_at ASC"
    );
    sqlx::query_as::<_, Todo>(&query)
        .bind(now)
        .fetch_all(pool)
        .await
}

/// Marque un rappel comme envoyé (évite de le rejouer à chaque tick).
pub async fn mark_reminded(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE todos SET reminded = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Sous-tâches (checklist à un niveau)
// ---------------------------------------------------------------------------

const SUBTASK_COLUMNS: &str = "id, todo_id, text, done, position, created_at";

pub async fn list_subtasks(pool: &SqlitePool, todo_id: &str) -> Result<Vec<SubTask>, sqlx::Error> {
    let query = format!("SELECT {SUBTASK_COLUMNS} FROM sub_tasks WHERE todo_id = ? ORDER BY position ASC");
    sqlx::query_as::<_, SubTask>(&query)
        .bind(todo_id)
        .fetch_all(pool)
        .await
}

/// Contenu modifié → à ré-indexer côté sidecar (le texte de la tâche indexé
/// inclut ses sous-tâches, voir `todos_needing_embedding`).
async fn flag_parent_needs_embedding(pool: &SqlitePool, todo_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE todos SET needs_embedding = 1 WHERE id = ?")
        .bind(todo_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create_subtask(pool: &SqlitePool, input: CreateSubTask) -> Result<SubTask, sqlx::Error> {
    let (max_position,): (Option<i64>,) =
        sqlx::query_as("SELECT MAX(position) FROM sub_tasks WHERE todo_id = ?")
            .bind(&input.todo_id)
            .fetch_one(pool)
            .await?;

    let sub = SubTask {
        id: Uuid::new_v4().to_string(),
        todo_id: input.todo_id,
        text: input.text,
        done: false,
        position: max_position.map(|p| p + 1).unwrap_or(0),
        created_at: now_iso(),
    };

    sqlx::query(
        "INSERT INTO sub_tasks (id, todo_id, text, done, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&sub.id)
    .bind(&sub.todo_id)
    .bind(&sub.text)
    .bind(sub.done)
    .bind(sub.position)
    .bind(&sub.created_at)
    .execute(pool)
    .await?;

    flag_parent_needs_embedding(pool, &sub.todo_id).await?;
    Ok(sub)
}

pub async fn update_subtask(
    pool: &SqlitePool,
    id: &str,
    input: UpdateSubTask,
) -> Result<SubTask, sqlx::Error> {
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE sub_tasks SET ");
    let mut sep = qb.separated(", ");
    if let Some(text) = input.text {
        sep.push("text = ").push_bind_unseparated(text);
    }
    if let Some(done) = input.done {
        sep.push("done = ").push_bind_unseparated(done);
    }
    qb.push(" WHERE id = ").push_bind(id);
    qb.build().execute(pool).await?;

    let query = format!("SELECT {SUBTASK_COLUMNS} FROM sub_tasks WHERE id = ?");
    let sub = sqlx::query_as::<_, SubTask>(&query)
        .bind(id)
        .fetch_one(pool)
        .await?;

    flag_parent_needs_embedding(pool, &sub.todo_id).await?;
    Ok(sub)
}

pub async fn delete_subtask(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    let todo_id: Option<(String,)> = sqlx::query_as("SELECT todo_id FROM sub_tasks WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    sqlx::query("DELETE FROM sub_tasks WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if let Some((todo_id,)) = todo_id {
        flag_parent_needs_embedding(pool, &todo_id).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Synchronisation vectorielle (D3) : items à (dés)indexer côté sidecar.
// Lu/écrit par `vectorizer.rs` (tâche de fond, calquée sur le planificateur
// de rappels ci-dessus).
// ---------------------------------------------------------------------------

/// Tâche ou note prête à être envoyée au sidecar (`POST /index`).
pub struct EmbeddingItem {
    pub id: String,
    pub kind: &'static str, // "task" ou "note"
    pub text: String,
}

/// Pose la suppression en attente : la ligne d'origine a déjà disparu au
/// moment où la tâche de fond tourne, impossible de lui poser un drapeau.
async fn queue_deindex(pool: &SqlitePool, id: &str, kind: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO pending_deindex (id, type, queued_at) VALUES (?, ?, ?) \
         ON CONFLICT(id) DO NOTHING",
    )
    .bind(id)
    .bind(kind)
    .bind(now_iso())
    .execute(pool)
    .await?;
    Ok(())
}

/// Suppressions en attente de répercussion (`POST /deindex`).
pub async fn pending_deindex(pool: &SqlitePool, limit: i64) -> Result<Vec<(String, String)>, sqlx::Error> {
    sqlx::query_as("SELECT id, type FROM pending_deindex LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await
}

/// Retire une suppression de la file une fois répercutée avec succès.
pub async fn clear_pending_deindex(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM pending_deindex WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Tâches à (ré)indexer. Texte envoyé = titre + note + sous-tâches + tags
/// (une seule chaîne, comme cherché sémantiquement d'un bloc — une liste de
/// courses doit être trouvable par ses éléments, une tâche par son contexte).
pub async fn todos_needing_embedding(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<EmbeddingItem>, sqlx::Error> {
    let rows: Vec<(String, String, Option<String>)> =
        sqlx::query_as("SELECT id, text, note FROM todos WHERE needs_embedding = 1 LIMIT ?")
            .bind(limit)
            .fetch_all(pool)
            .await?;

    let mut items = Vec::with_capacity(rows.len());
    for (id, text, note) in rows {
        let mut combined = match note {
            Some(n) if !n.is_empty() => format!("{text}\n{n}"),
            _ => text,
        };
        let subtasks = list_subtasks(pool, &id).await?;
        if !subtasks.is_empty() {
            let checklist: Vec<String> = subtasks.iter().map(|s| format!("- {}", s.text)).collect();
            combined = format!("{combined}\n{}", checklist.join("\n"));
        }
        let tags = list_todo_tags(pool, &id).await?;
        if !tags.is_empty() {
            let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
            combined = format!("{combined}\n{}", names.join(", "));
        }
        items.push(EmbeddingItem { id, kind: "task", text: combined });
    }
    Ok(items)
}

/// Redescend le drapeau une fois l'indexation confirmée par le sidecar.
pub async fn mark_todo_embedded(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE todos SET needs_embedding = 0 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Notes à (ré)indexer. Texte envoyé = titre + contenu.
pub async fn notes_needing_embedding(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<EmbeddingItem>, sqlx::Error> {
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, title, content FROM notes WHERE needs_embedding = 1 LIMIT ?")
            .bind(limit)
            .fetch_all(pool)
            .await?;

    Ok(rows
        .into_iter()
        .map(|(id, title, content)| {
            let text = if title.is_empty() { content } else { format!("{title}\n{content}") };
            EmbeddingItem { id, kind: "note", text }
        })
        .collect())
}

/// Redescend le drapeau une fois l'indexation confirmée par le sidecar.
pub async fn mark_note_embedded(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE notes SET needs_embedding = 0 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Réglages (table clé/valeur) + digest quotidien
// ---------------------------------------------------------------------------

const DIGEST_ENABLED_KEY: &str = "daily_digest_enabled";
const DIGEST_TIME_KEY: &str = "daily_digest_time";
const DIGEST_LAST_SENT_KEY: &str = "daily_digest_last_sent";

async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

/// Lit les réglages avec valeurs par défaut pour les clés absentes.
pub async fn get_settings(pool: &SqlitePool) -> Result<Settings, sqlx::Error> {
    let mut s = Settings::default();
    if let Some(v) = get_setting(pool, DIGEST_ENABLED_KEY).await? {
        s.daily_digest_enabled = v == "1";
    }
    if let Some(v) = get_setting(pool, DIGEST_TIME_KEY).await? {
        s.daily_digest_time = v;
    }
    Ok(s)
}

/// Écrit les champs fournis puis renvoie les réglages résolus.
pub async fn update_settings(
    pool: &SqlitePool,
    input: UpdateSettings,
) -> Result<Settings, sqlx::Error> {
    if let Some(enabled) = input.daily_digest_enabled {
        set_setting(pool, DIGEST_ENABLED_KEY, if enabled { "1" } else { "0" }).await?;
    }
    if let Some(time) = input.daily_digest_time {
        set_setting(pool, DIGEST_TIME_KEY, &time).await?;
    }
    get_settings(pool).await
}

/// Tâches à inclure dans le digest : à faire et planifiées pour aujourd'hui ou
/// en retard (`scheduled_for` <= today).
pub async fn digest_tasks(pool: &SqlitePool, today: &str) -> Result<Vec<Todo>, sqlx::Error> {
    let query = format!(
        "SELECT {SELECT_COLUMNS} FROM todos \
         WHERE status = 'pending' AND scheduled_for IS NOT NULL AND scheduled_for <= ? \
         ORDER BY scheduled_for ASC, created_at ASC"
    );
    sqlx::query_as::<_, Todo>(&query)
        .bind(today)
        .fetch_all(pool)
        .await
}

/// Évalue le digest quotidien. Renvoie `Some(tâches)` si le résumé doit être
/// envoyé maintenant (activé, heure atteinte, pas déjà envoyé aujourd'hui) et
/// marque le jour comme traité ; `None` sinon. La liste peut être vide
/// (heure atteinte mais rien à signaler) → ne pas notifier.
pub async fn take_due_digest(
    pool: &SqlitePool,
    today: &str,
    current_time: &str,
) -> Result<Option<Vec<Todo>>, sqlx::Error> {
    let settings = get_settings(pool).await?;
    if !settings.daily_digest_enabled || current_time < settings.daily_digest_time.as_str() {
        return Ok(None);
    }
    if get_setting(pool, DIGEST_LAST_SENT_KEY).await?.as_deref() == Some(today) {
        return Ok(None);
    }
    set_setting(pool, DIGEST_LAST_SENT_KEY, today).await?;
    Ok(Some(digest_tasks(pool, today).await?))
}

// ---------------------------------------------------------------------------
// Notes (entité autonome, contenu Markdown)
// ---------------------------------------------------------------------------

/// Liste les notes, épinglées d'abord, puis les plus récemment modifiées.
pub async fn list_notes(pool: &SqlitePool) -> Result<Vec<Note>, sqlx::Error> {
    let query =
        format!("SELECT {NOTE_COLUMNS} FROM notes ORDER BY pinned DESC, updated_at DESC");
    sqlx::query_as::<_, Note>(&query).fetch_all(pool).await
}

pub async fn get_note(pool: &SqlitePool, id: &str) -> Result<Option<Note>, sqlx::Error> {
    let query = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?");
    sqlx::query_as::<_, Note>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_note(pool: &SqlitePool, input: CreateNote) -> Result<Note, sqlx::Error> {
    let now = now_iso();
    let note = Note {
        id: Uuid::new_v4().to_string(),
        title: input.title.unwrap_or_default(),
        content: input.content.unwrap_or_default(),
        pinned: false,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&note.id)
    .bind(&note.title)
    .bind(&note.content)
    .bind(note.pinned)
    .bind(&note.created_at)
    .bind(&note.updated_at)
    .execute(pool)
    .await?;

    Ok(note)
}

pub async fn update_note(
    pool: &SqlitePool,
    id: &str,
    input: UpdateNote,
) -> Result<Note, sqlx::Error> {
    let now = now_iso();

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE notes SET ");
    let mut sep = qb.separated(", ");

    if let Some(title) = input.title {
        sep.push("title = ").push_bind_unseparated(title);
    }
    if let Some(content) = input.content {
        sep.push("content = ").push_bind_unseparated(content);
    }
    if let Some(pinned) = input.pinned {
        sep.push("pinned = ").push_bind_unseparated(pinned);
    }
    sep.push("updated_at = ").push_bind_unseparated(now);
    // Contenu potentiellement modifié → à ré-indexer côté sidecar (D3).
    sep.push("needs_embedding = ").push_bind_unseparated(1_i64);

    qb.push(" WHERE id = ").push_bind(id);
    qb.build().execute(pool).await?;

    get_note(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_note(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM notes WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    queue_deindex(pool, id, "note").await
}

/// Recherche plein-texte simple (LIKE) sur le titre et le contenu.
pub async fn search_notes(pool: &SqlitePool, query: &str) -> Result<Vec<Note>, sqlx::Error> {
    let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let sql = format!(
        "SELECT {NOTE_COLUMNS} FROM notes \
         WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\' \
         ORDER BY pinned DESC, updated_at DESC"
    );
    sqlx::query_as::<_, Note>(&sql)
        .bind(like)
        .fetch_all(pool)
        .await
}

// ---------------------------------------------------------------------------
// Domaines (Areas) — grands piliers regroupant des projets
// ---------------------------------------------------------------------------

const AREA_COLUMNS: &str = "id, name, position, created_at";

async fn next_position(pool: &SqlitePool, table: &str) -> Result<i64, sqlx::Error> {
    let (max,): (Option<i64>,) =
        sqlx::query_as(&format!("SELECT MAX(position) FROM {table}"))
            .fetch_one(pool)
            .await?;
    Ok(max.map(|p| p + 1).unwrap_or(0))
}

pub async fn list_areas(pool: &SqlitePool) -> Result<Vec<Area>, sqlx::Error> {
    let query = format!("SELECT {AREA_COLUMNS} FROM areas ORDER BY position ASC, name ASC");
    sqlx::query_as::<_, Area>(&query).fetch_all(pool).await
}

pub async fn create_area(pool: &SqlitePool, input: CreateArea) -> Result<Area, sqlx::Error> {
    let area = Area {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        position: next_position(pool, "areas").await?,
        created_at: now_iso(),
    };
    sqlx::query("INSERT INTO areas (id, name, position, created_at) VALUES (?, ?, ?, ?)")
        .bind(&area.id)
        .bind(&area.name)
        .bind(area.position)
        .bind(&area.created_at)
        .execute(pool)
        .await?;
    Ok(area)
}

pub async fn update_area(pool: &SqlitePool, id: &str, input: UpdateArea) -> Result<Area, sqlx::Error> {
    // Rien à écrire → éviter un « SET » vide (SQL invalide), simple relecture.
    if input.name.is_some() || input.position.is_some() {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE areas SET ");
        let mut sep = qb.separated(", ");
        if let Some(name) = input.name {
            sep.push("name = ").push_bind_unseparated(name);
        }
        if let Some(position) = input.position {
            sep.push("position = ").push_bind_unseparated(position);
        }
        qb.push(" WHERE id = ").push_bind(id);
        qb.build().execute(pool).await?;
    }

    let query = format!("SELECT {AREA_COLUMNS} FROM areas WHERE id = ?");
    sqlx::query_as::<_, Area>(&query)
        .bind(id)
        .fetch_one(pool)
        .await
}

/// Supprime un domaine et détache ses projets ET ses tâches directes (pas de
/// cascade dans ce schéma) : rien n'est supprimé, seulement désaffecté.
pub async fn delete_area(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE projects SET area_id = NULL WHERE area_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE todos SET area_id = NULL WHERE area_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM areas WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Projets — conteneurs concrets (note, deadline, achèvement)
// ---------------------------------------------------------------------------

const PROJECT_COLUMNS: &str =
    "id, name, note, area_id, status, deadline, position, created_at, updated_at";

pub async fn list_projects(pool: &SqlitePool) -> Result<Vec<Project>, sqlx::Error> {
    let query = format!("SELECT {PROJECT_COLUMNS} FROM projects ORDER BY position ASC, name ASC");
    sqlx::query_as::<_, Project>(&query).fetch_all(pool).await
}

pub async fn get_project(pool: &SqlitePool, id: &str) -> Result<Option<Project>, sqlx::Error> {
    let query = format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?");
    sqlx::query_as::<_, Project>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_project(
    pool: &SqlitePool,
    input: CreateProject,
) -> Result<Project, sqlx::Error> {
    let now = now_iso();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        note: input.note,
        area_id: input.area_id,
        status: crate::models::ProjectStatus::Active,
        deadline: input.deadline,
        position: next_position(pool, "projects").await?,
        created_at: now.clone(),
        updated_at: now,
    };
    sqlx::query(
        "INSERT INTO projects (id, name, note, area_id, status, deadline, position, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&project.id)
    .bind(&project.name)
    .bind(&project.note)
    .bind(&project.area_id)
    .bind(project.status)
    .bind(&project.deadline)
    .bind(project.position)
    .bind(&project.created_at)
    .bind(&project.updated_at)
    .execute(pool)
    .await?;
    Ok(project)
}

pub async fn update_project(
    pool: &SqlitePool,
    id: &str,
    input: UpdateProject,
) -> Result<Project, sqlx::Error> {
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE projects SET ");
    let mut sep = qb.separated(", ");
    if let Some(name) = input.name {
        sep.push("name = ").push_bind_unseparated(name);
    }
    if let Some(note) = input.note {
        sep.push("note = ").push_bind_unseparated(note);
    }
    if let Some(area_id) = input.area_id {
        sep.push("area_id = ").push_bind_unseparated(area_id);
    }
    if let Some(status) = input.status {
        sep.push("status = ").push_bind_unseparated(status);
    }
    if let Some(deadline) = input.deadline {
        sep.push("deadline = ").push_bind_unseparated(deadline);
    }
    if let Some(position) = input.position {
        sep.push("position = ").push_bind_unseparated(position);
    }
    sep.push("updated_at = ").push_bind_unseparated(now_iso());
    qb.push(" WHERE id = ").push_bind(id);
    qb.build().execute(pool).await?;

    get_project(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Supprime un projet : détache ses tâches (project_id/heading_id → NULL) et
/// supprime ses en-têtes (pas de cascade dans ce schéma).
pub async fn delete_project(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE todos SET project_id = NULL, heading_id = NULL WHERE project_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM headings WHERE project_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Migre les anciennes « listes » (texte libre sur `todos.list`) vers de vrais
/// projets. Volontairement en Rust plutôt qu'en SQL de migration : un
/// `project_id` figé par migration serait périmé dès la première édition, et le
/// SQL diffusé est verrouillé par checksum sqlx (impossible à corriger ensuite).
///
/// **Idempotente** : rejouée à chaque démarrage sans effet (le `WHERE
/// project_id IS NULL` rend les re-passages inertes). C'est ce qui rattrape le
/// cas d'une tâche créée par une ancienne version du binaire.
///
/// Rapprochement **insensible à la casse** : « Travail » et « travail » sont une
/// faute de frappe, pas deux projets — même politique que `create_tag`. Attention,
/// `DISTINCT` et `=` sont en collation BINARY par défaut : sans `COLLATE NOCASE`
/// explicite, on créerait deux projets puis on n'en rattacherait qu'un.
///
/// Renvoie le nombre de projets créés.
pub async fn reconcile_lists_into_projects(pool: &SqlitePool) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Listes distinctes (à la casse près), en ignorant les vides/espaces.
    let names: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT TRIM(list) COLLATE NOCASE FROM todos \
         WHERE list IS NOT NULL AND TRIM(list) <> ''",
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut created = 0usize;
    for (name,) in names {
        // Projet déjà existant pour ce nom ? (rejeu, ou projet créé à la main)
        let existing: Option<(String,)> =
            sqlx::query_as("SELECT id FROM projects WHERE name = ? COLLATE NOCASE")
                .bind(&name)
                .fetch_optional(&mut *tx)
                .await?;

        let project_id = match existing {
            Some((id,)) => id,
            None => {
                let now = now_iso();
                let (max,): (Option<i64>,) = sqlx::query_as("SELECT MAX(position) FROM projects")
                    .fetch_one(&mut *tx)
                    .await?;
                let id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO projects (id, name, note, area_id, status, deadline, position, created_at, updated_at) \
                     VALUES (?, ?, NULL, NULL, 'active', NULL, ?, ?, ?)",
                )
                .bind(&id)
                .bind(&name)
                .bind(max.map(|p| p + 1).unwrap_or(0))
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
                created += 1;
                id
            }
        };

        // Ne touche que les tâches pas encore rattachées → rejeu sans effet.
        sqlx::query(
            "UPDATE todos SET project_id = ? \
             WHERE TRIM(list) = ? COLLATE NOCASE AND project_id IS NULL",
        )
        .bind(&project_id)
        .bind(&name)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(created)
}

// ---------------------------------------------------------------------------
// Tags — contexte transverse (nom unique insensible à la casse)
// ---------------------------------------------------------------------------

const TAG_COLUMNS: &str = "id, name, parent_id, created_at";

pub async fn list_tags(pool: &SqlitePool) -> Result<Vec<Tag>, sqlx::Error> {
    let query = format!("SELECT {TAG_COLUMNS} FROM tags ORDER BY name COLLATE NOCASE ASC");
    sqlx::query_as::<_, Tag>(&query).fetch_all(pool).await
}

/// Crée un tag, ou renvoie l'existant si le nom (insensible à la casse) existe
/// déjà — évite une violation de contrainte UNIQUE et sert de « get-or-create ».
pub async fn create_tag(pool: &SqlitePool, input: CreateTag) -> Result<Tag, sqlx::Error> {
    let existing = sqlx::query_as::<_, Tag>(&format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE name = ? COLLATE NOCASE"
    ))
    .bind(&input.name)
    .fetch_optional(pool)
    .await?;
    if let Some(tag) = existing {
        return Ok(tag);
    }

    let tag = Tag {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        parent_id: input.parent_id,
        created_at: now_iso(),
    };
    sqlx::query("INSERT INTO tags (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(&tag.id)
        .bind(&tag.name)
        .bind(&tag.parent_id)
        .bind(&tag.created_at)
        .execute(pool)
        .await?;
    Ok(tag)
}

/// Marque toutes les tâches portant ce tag comme à ré-indexer.
///
/// Un tag est **dénormalisé** dans le payload `Todo` ET dans son texte
/// d'embedding : renommer ou supprimer un tag change donc l'indexation de
/// CHAQUE tâche qui le porte. Sans ça, la recherche sémantique répondrait
/// encore sur l'ancien nom — une panne silencieuse, découverte des semaines
/// plus tard. (Contrairement aux sous-tâches, qui n'affectent qu'un parent.)
async fn flag_tagged_todos_need_embedding(
    pool: &SqlitePool,
    tag_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE todos SET needs_embedding = 1 \
         WHERE id IN (SELECT todo_id FROM task_tags WHERE tag_id = ?)",
    )
    .bind(tag_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_tag(pool: &SqlitePool, id: &str, input: UpdateTag) -> Result<Tag, sqlx::Error> {
    if let Some(name) = input.name {
        sqlx::query("UPDATE tags SET name = ? WHERE id = ?")
            .bind(name)
            .bind(id)
            .execute(pool)
            .await?;
        // Le nom est indexé avec chaque tâche portant ce tag.
        flag_tagged_todos_need_embedding(pool, id).await?;
    }
    sqlx::query_as::<_, Tag>(&format!("SELECT {TAG_COLUMNS} FROM tags WHERE id = ?"))
        .bind(id)
        .fetch_one(pool)
        .await
}

/// Supprime un tag et ses liaisons (pas de cascade dans ce schéma).
pub async fn delete_tag(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    // AVANT de purger les liaisons : après, la liste des tâches concernées
    // n'existe plus et on ne saurait plus lesquelles ré-indexer.
    flag_tagged_todos_need_embedding(pool, id).await?;
    sqlx::query("DELETE FROM task_tags WHERE tag_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Liaison tâche ↔ tags
// ---------------------------------------------------------------------------

/// Tags d'une tâche, triés par nom (ordre d'affichage stable).
pub async fn list_todo_tags(pool: &SqlitePool, todo_id: &str) -> Result<Vec<Tag>, sqlx::Error> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.parent_id, t.created_at FROM tags t \
         JOIN task_tags tt ON tt.tag_id = t.id \
         WHERE tt.todo_id = ? ORDER BY t.name COLLATE NOCASE ASC",
    )
    .bind(todo_id)
    .fetch_all(pool)
    .await
}

/// Remplace l'intégralité des tags d'une tâche (sémantique « replace-all »,
/// alignée sur une multi-sélection). En transaction : une lecture concurrente
/// ne doit jamais voir l'état intermédiaire vide.
pub async fn set_todo_tags(
    pool: &SqlitePool,
    todo_id: &str,
    tag_ids: &[String],
) -> Result<Todo, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM task_tags WHERE todo_id = ?")
        .bind(todo_id)
        .execute(&mut *tx)
        .await?;

    for tag_id in tag_ids {
        // OR IGNORE : un id dupliqué dans la charge utile violerait la clé
        // primaire composite et ferait échouer tout l'appel.
        sqlx::query("INSERT OR IGNORE INTO task_tags (todo_id, tag_id) VALUES (?, ?)")
            .bind(todo_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
    }

    // Les tags font partie du texte indexé → à ré-indexer.
    sqlx::query("UPDATE todos SET needs_embedding = 1, updated_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(todo_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    get(pool, todo_id).await?.ok_or(sqlx::Error::RowNotFound)
}

#[cfg(test)]
mod tests {
    use super::{
        create, create_area, create_note, create_project, create_tag, delete, delete_area,
        delete_note, delete_project, delete_tag, due_reminders, get, get_settings, list_all,
        list_areas, list_by_date, list_notes, list_projects, list_tags, mark_reminded,
        reconcile_lists_into_projects, search_notes, set_todo_tags, take_due_digest,
        todos_needing_embedding, toggle, update, update_area, update_note, update_project,
        update_settings, update_tag,
    };
    use crate::models::{
        CreateArea, CreateNote, CreateProject, CreateTag, CreateTodo, TodoStatus, UpdateArea,
        UpdateNote, UpdateProject, UpdateSettings, UpdateTag, UpdateTodo,
    };
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    // Une seule connexion : le ":memory:" reste partagé pour toute la durée du test.
    async fn memory_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn new_todo(text: &str) -> CreateTodo {
        CreateTodo {
            text: text.to_string(),
            note: None,
            list: None,
            priority: None,
            recurrence: None,
            scheduled_for: None,
            due_date: None,
            remind_at: None,
            project_id: None,
            area_id: None,
            heading_id: None,
            this_evening: false,
            someday: false,
        }
    }

    #[tokio::test]
    async fn create_sets_defaults_and_lists() {
        let pool = memory_pool().await;
        let mut input = new_todo("Acheter du pain");
        input.scheduled_for = Some("2026-06-07".to_string());

        let todo = create(&pool, input).await.unwrap();
        assert_eq!(todo.text, "Acheter du pain");
        assert!(matches!(todo.status, TodoStatus::Pending));

        assert_eq!(list_all(&pool).await.unwrap().len(), 1);
        assert_eq!(list_by_date(&pool, "2026-06-07").await.unwrap().len(), 1);
        assert_eq!(list_by_date(&pool, "2026-06-08").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn toggle_flips_status_back_and_forth() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("X")).await.unwrap();

        let once = toggle(&pool, &todo.id).await.unwrap();
        assert!(matches!(once.status, TodoStatus::Completed));

        let twice = toggle(&pool, &todo.id).await.unwrap();
        assert!(matches!(twice.status, TodoStatus::Pending));
    }

    #[tokio::test]
    async fn update_changes_only_given_fields() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("Ancien texte")).await.unwrap();

        let updated = update(
            &pool,
            &todo.id,
            UpdateTodo {
                text: Some("Nouveau texte".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.text, "Nouveau texte");
        assert_eq!(updated.created_at, todo.created_at);
    }

    #[tokio::test]
    async fn toggle_reschedules_a_recurring_task_instead_of_completing() {
        use crate::models::Recurrence;
        let pool = memory_pool().await;
        let mut input = new_todo("Sport");
        input.recurrence = Some(Recurrence::Daily);
        input.scheduled_for = Some("2026-06-14".to_string());
        let todo = create(&pool, input).await.unwrap();

        let after = toggle(&pool, &todo.id).await.unwrap();
        // Reste « à faire », date avancée d'un jour.
        assert!(matches!(after.status, TodoStatus::Pending));
        assert_eq!(after.scheduled_for.as_deref(), Some("2026-06-15"));
    }

    #[tokio::test]
    async fn update_can_clear_a_nullable_field() {
        let pool = memory_pool().await;
        let mut input = new_todo("Avec note");
        input.note = Some("une note".to_string());
        let todo = create(&pool, input).await.unwrap();
        assert_eq!(todo.note.as_deref(), Some("une note"));

        // Some(None) → remet la colonne à NULL.
        let cleared = update(
            &pool,
            &todo.id,
            UpdateTodo {
                note: Some(None),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(cleared.note, None);
    }

    #[tokio::test]
    async fn due_reminders_returns_only_past_unsent_pending() {
        let pool = memory_pool().await;

        let mut past = new_todo("Rappel passé");
        past.remind_at = Some("2026-06-14T08:00".to_string());
        let past = create(&pool, past).await.unwrap();

        let mut future = new_todo("Rappel futur");
        future.remind_at = Some("2026-06-14T23:00".to_string());
        create(&pool, future).await.unwrap();

        let sans = new_todo("Sans rappel");
        create(&pool, sans).await.unwrap();

        let due = due_reminders(&pool, "2026-06-14T09:00").await.unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, past.id);

        // Une fois notifié, il ne ressort plus.
        mark_reminded(&pool, &past.id).await.unwrap();
        assert!(due_reminders(&pool, "2026-06-14T09:00")
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn update_remind_at_rearms_the_reminder() {
        let pool = memory_pool().await;
        let mut input = new_todo("Avec rappel");
        input.remind_at = Some("2026-06-14T08:00".to_string());
        let todo = create(&pool, input).await.unwrap();

        // Notifié une première fois → ne ressort plus.
        mark_reminded(&pool, &todo.id).await.unwrap();
        assert!(due_reminders(&pool, "2026-06-14T09:00")
            .await
            .unwrap()
            .is_empty());

        // Changer l'heure du rappel réarme la notification (reminded -> 0).
        update(
            &pool,
            &todo.id,
            UpdateTodo {
                remind_at: Some(Some("2026-06-14T08:30".to_string())),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(
            due_reminders(&pool, "2026-06-14T09:00").await.unwrap().len(),
            1
        );
    }

    #[tokio::test]
    async fn toggle_shifts_remind_at_for_recurring_task() {
        use crate::models::Recurrence;
        let pool = memory_pool().await;
        let mut input = new_todo("Médicament");
        input.recurrence = Some(Recurrence::Daily);
        input.scheduled_for = Some("2026-06-14".to_string());
        input.remind_at = Some("2026-06-14T20:00".to_string());
        let todo = create(&pool, input).await.unwrap();

        let after = toggle(&pool, &todo.id).await.unwrap();
        assert!(matches!(after.status, TodoStatus::Pending));
        assert_eq!(after.scheduled_for.as_deref(), Some("2026-06-15"));
        // Même heure, jour suivant.
        assert_eq!(after.remind_at.as_deref(), Some("2026-06-15T20:00"));
    }

    #[tokio::test]
    async fn delete_removes_the_todo() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("À supprimer")).await.unwrap();

        delete(&pool, &todo.id).await.unwrap();
        assert!(list_all(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn settings_have_defaults_and_persist_updates() {
        let pool = memory_pool().await;

        let defaults = get_settings(&pool).await.unwrap();
        assert!(!defaults.daily_digest_enabled);
        assert_eq!(defaults.daily_digest_time, "08:00");

        let updated = update_settings(
            &pool,
            UpdateSettings {
                daily_digest_enabled: Some(true),
                daily_digest_time: Some("07:30".to_string()),
            },
        )
        .await
        .unwrap();
        assert!(updated.daily_digest_enabled);
        assert_eq!(updated.daily_digest_time, "07:30");

        // Mise à jour partielle : ne touche pas à l'heure.
        let partial = update_settings(
            &pool,
            UpdateSettings {
                daily_digest_enabled: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert!(!partial.daily_digest_enabled);
        assert_eq!(partial.daily_digest_time, "07:30");
    }

    #[tokio::test]
    async fn digest_fires_once_per_day_after_configured_time() {
        let pool = memory_pool().await;
        let mut input = new_todo("Tâche du jour");
        input.scheduled_for = Some("2026-06-15".to_string());
        create(&pool, input).await.unwrap();

        update_settings(
            &pool,
            UpdateSettings {
                daily_digest_enabled: Some(true),
                daily_digest_time: Some("08:00".to_string()),
            },
        )
        .await
        .unwrap();

        // Avant l'heure : rien.
        assert!(take_due_digest(&pool, "2026-06-15", "07:59")
            .await
            .unwrap()
            .is_none());

        // À l'heure : on récupère les tâches du jour.
        let due = take_due_digest(&pool, "2026-06-15", "08:00").await.unwrap();
        assert_eq!(due.unwrap().len(), 1);

        // Déjà envoyé aujourd'hui : plus rien, même plus tard.
        assert!(take_due_digest(&pool, "2026-06-15", "09:00")
            .await
            .unwrap()
            .is_none());

        // Le lendemain : à nouveau.
        let next_day = take_due_digest(&pool, "2026-06-16", "08:00").await.unwrap();
        assert!(next_day.is_some());
    }

    #[tokio::test]
    async fn digest_disabled_never_fires() {
        let pool = memory_pool().await;
        assert!(take_due_digest(&pool, "2026-06-15", "12:00")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn notes_crud_search_and_pin_ordering() {
        let pool = memory_pool().await;

        let a = create_note(
            &pool,
            CreateNote {
                title: Some("Idées".to_string()),
                content: Some("acheter un cadeau".to_string()),
            },
        )
        .await
        .unwrap();
        create_note(
            &pool,
            CreateNote {
                title: Some("Courses".to_string()),
                content: Some("lait".to_string()),
            },
        )
        .await
        .unwrap();

        assert_eq!(list_notes(&pool).await.unwrap().len(), 2);

        // Recherche sur le contenu.
        let found = search_notes(&pool, "cadeau").await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, a.id);

        // Épingler `a` → remonte en tête de liste.
        update_note(
            &pool,
            &a.id,
            UpdateNote {
                pinned: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let listed = list_notes(&pool).await.unwrap();
        assert_eq!(listed[0].id, a.id);
        assert!(listed[0].pinned);

        // Mise à jour partielle du contenu (ne touche pas au titre).
        let upd = update_note(
            &pool,
            &a.id,
            UpdateNote {
                content: Some("acheter deux cadeaux".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(upd.content, "acheter deux cadeaux");
        assert_eq!(upd.title, "Idées");

        delete_note(&pool, &a.id).await.unwrap();
        assert_eq!(list_notes(&pool).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn area_crud_and_project_detach_on_delete() {
        let pool = memory_pool().await;
        let area = create_area(&pool, CreateArea { name: "Travail".into() })
            .await
            .unwrap();
        let project = create_project(
            &pool,
            CreateProject {
                name: "Listik".into(),
                area_id: Some(area.id.clone()),
                note: None,
                deadline: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(list_areas(&pool).await.unwrap().len(), 1);

        let renamed = update_area(
            &pool,
            &area.id,
            UpdateArea { name: Some("Perso".into()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(renamed.name, "Perso");

        // Supprimer le domaine détache le projet (area_id → NULL), sans le supprimer.
        delete_area(&pool, &area.id).await.unwrap();
        assert!(list_areas(&pool).await.unwrap().is_empty());
        let projects = list_projects(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].area_id, None);
        assert_eq!(projects[0].id, project.id);
    }

    #[tokio::test]
    async fn project_delete_detaches_its_tasks() {
        let pool = memory_pool().await;
        let project = create_project(
            &pool,
            CreateProject { name: "Courses".into(), area_id: None, note: None, deadline: None },
        )
        .await
        .unwrap();

        let mut input = new_todo("Acheter du lait");
        input.project_id = Some(project.id.clone());
        let todo = create(&pool, input).await.unwrap();
        assert_eq!(todo.project_id.as_deref(), Some(project.id.as_str()));

        let updated = update_project(
            &pool,
            &project.id,
            UpdateProject { name: Some("Épicerie".into()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(updated.name, "Épicerie");

        // Supprimer le projet détache la tâche (project_id → NULL), sans la supprimer.
        delete_project(&pool, &project.id).await.unwrap();
        assert!(list_projects(&pool).await.unwrap().is_empty());
        let all = list_all(&pool).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].project_id, None);
    }

    #[tokio::test]
    async fn reconcile_creates_one_project_per_list_and_is_idempotent() {
        let pool = memory_pool().await;

        let mut a = new_todo("Lait");
        a.list = Some("Courses".into());
        let a = create(&pool, a).await.unwrap();
        let mut b = new_todo("Pain");
        b.list = Some("Courses".into());
        create(&pool, b).await.unwrap();
        let mut c = new_todo("Rapport");
        c.list = Some("Travail".into());
        create(&pool, c).await.unwrap();
        // Sans liste → ne doit produire aucun projet.
        create(&pool, new_todo("Vague")).await.unwrap();

        assert_eq!(reconcile_lists_into_projects(&pool).await.unwrap(), 2);
        let projects = list_projects(&pool).await.unwrap();
        let mut names: Vec<&str> = projects.iter().map(|p| p.name.as_str()).collect();
        names.sort();
        assert_eq!(names, ["Courses", "Travail"]);

        // Les tâches sont rattachées ; celle sans liste reste libre.
        let all = list_all(&pool).await.unwrap();
        let by_text = |t: &str| all.iter().find(|x| x.text == t).unwrap().clone();
        let courses = projects.iter().find(|p| p.name == "Courses").unwrap();
        assert_eq!(by_text("Lait").project_id.as_deref(), Some(courses.id.as_str()));
        assert_eq!(by_text("Pain").project_id.as_deref(), Some(courses.id.as_str()));
        assert_eq!(by_text("Vague").project_id, None);
        // La liste d'origine est conservée (pont de repli tant qu'elle existe).
        assert_eq!(by_text("Lait").list.as_deref(), Some("Courses"));

        // Rejeu : aucun nouveau projet, aucun changement.
        assert_eq!(reconcile_lists_into_projects(&pool).await.unwrap(), 0);
        assert_eq!(list_projects(&pool).await.unwrap().len(), 2);
        assert_eq!(
            list_all(&pool)
                .await
                .unwrap()
                .iter()
                .find(|x| x.id == a.id)
                .unwrap()
                .project_id
                .as_deref(),
            Some(courses.id.as_str())
        );
    }

    #[tokio::test]
    async fn reconcile_merges_lists_differing_only_by_case() {
        let pool = memory_pool().await;
        let mut a = new_todo("A");
        a.list = Some("Travail".into());
        create(&pool, a).await.unwrap();
        let mut b = new_todo("B");
        b.list = Some("travail".into());
        create(&pool, b).await.unwrap();
        // Espaces parasites : même liste, pas un troisième projet.
        let mut c = new_todo("C");
        c.list = Some("  Travail  ".into());
        create(&pool, c).await.unwrap();

        assert_eq!(reconcile_lists_into_projects(&pool).await.unwrap(), 1);
        let projects = list_projects(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);

        // Les trois tâches pointent le même projet (piège : DISTINCT/= sont
        // BINARY par défaut → sans COLLATE NOCASE, « travail » resterait NULL).
        let pid = projects[0].id.as_str();
        for t in list_all(&pool).await.unwrap() {
            assert_eq!(t.project_id.as_deref(), Some(pid), "tâche {}", t.text);
        }
    }

    #[tokio::test]
    async fn reconcile_reuses_an_existing_project_of_the_same_name() {
        let pool = memory_pool().await;
        let existing = create_project(
            &pool,
            CreateProject { name: "Courses".into(), area_id: None, note: None, deadline: None },
        )
        .await
        .unwrap();

        let mut t = new_todo("Lait");
        t.list = Some("courses".into());
        create(&pool, t).await.unwrap();

        // Aucun projet créé : celui existant est réutilisé.
        assert_eq!(reconcile_lists_into_projects(&pool).await.unwrap(), 0);
        assert_eq!(list_projects(&pool).await.unwrap().len(), 1);
        assert_eq!(
            list_all(&pool).await.unwrap()[0].project_id.as_deref(),
            Some(existing.id.as_str())
        );
    }

    #[tokio::test]
    async fn deleting_an_area_detaches_projects_and_direct_tasks() {
        let pool = memory_pool().await;
        let area = create_area(&pool, CreateArea { name: "Perso".into() }).await.unwrap();
        create_project(
            &pool,
            CreateProject {
                name: "Sport".into(),
                area_id: Some(area.id.clone()),
                note: None,
                deadline: None,
            },
        )
        .await
        .unwrap();
        // Tâche rangée DIRECTEMENT dans le domaine (sans projet).
        let mut t = new_todo("Ranger le garage");
        t.area_id = Some(area.id.clone());
        create(&pool, t).await.unwrap();

        delete_area(&pool, &area.id).await.unwrap();

        assert_eq!(list_projects(&pool).await.unwrap()[0].area_id, None);
        let all = list_all(&pool).await.unwrap();
        assert_eq!(all.len(), 1, "la tâche ne doit pas être supprimée");
        assert_eq!(all[0].area_id, None);
    }

    /// Lit le drapeau interne d'indexation (hors `SELECT_COLUMNS`).
    async fn needs_embedding(pool: &SqlitePool, id: &str) -> bool {
        let (flag,): (i64,) = sqlx::query_as("SELECT needs_embedding FROM todos WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap();
        flag == 1
    }

    async fn clear_embedding_flags(pool: &SqlitePool) {
        sqlx::query("UPDATE todos SET needs_embedding = 0")
            .execute(pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn set_todo_tags_replaces_the_whole_set_and_tolerates_duplicates() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("Appeler le plombier")).await.unwrap();
        let urgent = create_tag(&pool, CreateTag { name: "urgent".into(), parent_id: None })
            .await
            .unwrap();
        let maison = create_tag(&pool, CreateTag { name: "maison".into(), parent_id: None })
            .await
            .unwrap();

        // Doublon dans la charge utile : ne doit PAS violer la clé composite.
        let updated = set_todo_tags(
            &pool,
            &todo.id,
            &[urgent.id.clone(), maison.id.clone(), urgent.id.clone()],
        )
        .await
        .unwrap();
        // Triés par nom.
        assert_eq!(
            updated.tags.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["maison", "urgent"]
        );

        // Replace-all : ne conserve que ce qui est fourni.
        let updated = set_todo_tags(&pool, &todo.id, &[maison.id.clone()]).await.unwrap();
        assert_eq!(
            updated.tags.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["maison"]
        );

        // Ensemble vide : retire tout.
        let updated = set_todo_tags(&pool, &todo.id, &[]).await.unwrap();
        assert!(updated.tags.is_empty());
    }

    #[tokio::test]
    async fn tags_are_attached_on_every_read_path() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("X")).await.unwrap();
        let tag = create_tag(&pool, CreateTag { name: "ctx".into(), parent_id: None })
            .await
            .unwrap();
        set_todo_tags(&pool, &todo.id, &[tag.id.clone()]).await.unwrap();

        // `get` inlinait autrefois l'attache : il doit passer par le helper commun.
        assert_eq!(get(&pool, &todo.id).await.unwrap().unwrap().tags.len(), 1);
        assert_eq!(list_all(&pool).await.unwrap()[0].tags.len(), 1);
    }

    #[tokio::test]
    async fn renaming_a_tag_reindexes_every_task_that_carries_it() {
        let pool = memory_pool().await;
        let a = create(&pool, new_todo("A")).await.unwrap();
        let b = create(&pool, new_todo("B")).await.unwrap();
        let c = create(&pool, new_todo("C")).await.unwrap();
        let tag = create_tag(&pool, CreateTag { name: "boulot".into(), parent_id: None })
            .await
            .unwrap();
        set_todo_tags(&pool, &a.id, &[tag.id.clone()]).await.unwrap();
        set_todo_tags(&pool, &b.id, &[tag.id.clone()]).await.unwrap();
        clear_embedding_flags(&pool).await;

        update_tag(&pool, &tag.id, UpdateTag { name: Some("travail".into()) })
            .await
            .unwrap();

        // Le nom du tag fait partie du texte indexé de chaque tâche porteuse.
        assert!(needs_embedding(&pool, &a.id).await);
        assert!(needs_embedding(&pool, &b.id).await);
        // Celle qui ne porte pas le tag n'est pas touchée.
        assert!(!needs_embedding(&pool, &c.id).await);
    }

    #[tokio::test]
    async fn deleting_a_tag_reindexes_its_tasks_before_dropping_the_links() {
        let pool = memory_pool().await;
        let a = create(&pool, new_todo("A")).await.unwrap();
        let tag = create_tag(&pool, CreateTag { name: "obsolete".into(), parent_id: None })
            .await
            .unwrap();
        set_todo_tags(&pool, &a.id, &[tag.id.clone()]).await.unwrap();
        clear_embedding_flags(&pool).await;

        delete_tag(&pool, &tag.id).await.unwrap();

        // Si on purgeait `task_tags` d'abord, on ne saurait plus qui ré-indexer.
        assert!(needs_embedding(&pool, &a.id).await);
        assert!(get(&pool, &a.id).await.unwrap().unwrap().tags.is_empty());
        assert!(list_tags(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn embedding_text_includes_tag_names() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("Appeler Jean")).await.unwrap();
        let tag = create_tag(&pool, CreateTag { name: "téléphone".into(), parent_id: None })
            .await
            .unwrap();
        set_todo_tags(&pool, &todo.id, &[tag.id]).await.unwrap();

        let items = todos_needing_embedding(&pool, 10).await.unwrap();
        let item = items.iter().find(|i| i.id == todo.id).unwrap();
        assert!(item.text.contains("Appeler Jean"));
        assert!(item.text.contains("téléphone"), "texte indexé: {}", item.text);
    }

    #[tokio::test]
    async fn deleting_a_todo_drops_its_tag_links() {
        let pool = memory_pool().await;
        let todo = create(&pool, new_todo("X")).await.unwrap();
        let tag = create_tag(&pool, CreateTag { name: "t".into(), parent_id: None })
            .await
            .unwrap();
        set_todo_tags(&pool, &todo.id, &[tag.id.clone()]).await.unwrap();

        delete(&pool, &todo.id).await.unwrap();

        // Le tag survit, la liaison non.
        assert_eq!(list_tags(&pool).await.unwrap().len(), 1);
        let (links,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM task_tags")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(links, 0);
    }

    #[tokio::test]
    async fn tag_create_is_case_insensitive_get_or_create() {
        let pool = memory_pool().await;
        let a = create_tag(&pool, CreateTag { name: "Urgent".into(), parent_id: None })
            .await
            .unwrap();
        // Même nom, casse différente → renvoie le tag existant (pas de doublon).
        let b = create_tag(&pool, CreateTag { name: "urgent".into(), parent_id: None })
            .await
            .unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(list_tags(&pool).await.unwrap().len(), 1);

        let renamed = update_tag(&pool, &a.id, UpdateTag { name: Some("Prioritaire".into()) })
            .await
            .unwrap();
        assert_eq!(renamed.name, "Prioritaire");

        delete_tag(&pool, &a.id).await.unwrap();
        assert!(list_tags(&pool).await.unwrap().is_empty());
    }
}
