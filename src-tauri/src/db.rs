use crate::models::{
    Area, CreateArea, CreateJournalEntry, CreateNote, CreateProject, CreateSubTask, CreateTag,
    CreateTodo, JournalDayCount, JournalEntry, JournalExport, JournalHit, JournalPiece, Note, Project, Recurrence, Settings, SubTask, Tag,
    Todo, TodoStatus,
    UpdateArea, UpdateJournalEntry, UpdateNote, UpdateProject, UpdateSettings, UpdateSubTask,
    UpdateTag, UpdateTodo,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// État partagé exposé aux commandes Tauri.
pub struct AppState {
    pub pool: SqlitePool,
    /// Port du serveur MCP in-process (Phase R), posé au démarrage.
    pub mcp_port: Option<u16>,
}

const SELECT_COLUMNS: &str =
    "id, text, note, list, status, priority, recurrence, recur_interval, recur_weekday, \
     recur_weekdays, recur_setpos, recur_mode, scheduled_for, due_date, remind_at, \
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
        recur_interval: input.recur_interval.max(1),
        recur_weekday: input.recur_weekday,
        recur_weekdays: input.recur_weekdays,
        recur_setpos: input.recur_setpos,
        recur_mode: input.recur_mode,
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
        "INSERT INTO todos (id, text, note, list, status, priority, recurrence, recur_interval, \
         recur_weekday, recur_weekdays, recur_setpos, recur_mode, scheduled_for, due_date, \
         remind_at, project_id, area_id, heading_id, this_evening, someday, created_at, \
         updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&todo.id)
    .bind(&todo.text)
    .bind(&todo.note)
    .bind(&todo.list)
    .bind(todo.status)
    .bind(todo.priority)
    .bind(todo.recurrence)
    .bind(todo.recur_interval)
    .bind(todo.recur_weekday)
    .bind(&todo.recur_weekdays)
    .bind(todo.recur_setpos)
    .bind(todo.recur_mode)
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

// ---------------------------------------------------------------------------
// Duplication — « gabarit réutilisable » (Phase L)
// ---------------------------------------------------------------------------

/// Copie une tâche DANS une transaction en cours : titre/note/priorité/règle
/// de récurrence/tags/sous-tâches copiés ; statut et dates remis à zéro (un
/// gabarit réutilisable, pas un clone d'état). Les sous-tâches sont copiées
/// JAMAIS cochées, même si l'original l'était.
///
/// La règle de récurrence est copiée TELLE QUELLE, en connaissance de cause :
/// si l'original est récurrent, la copie génère SA PROPRE prochaine
/// occurrence en se terminant — c'est ce que « dupliquer une tâche
/// récurrente » signifie, pas un bug à corriger.
///
/// `project_id`/`area_id` sont des paramètres (pas recopiés de `source`) pour
/// que `duplicate_project` puisse rattacher chaque copie au NOUVEAU projet.
async fn duplicate_todo_tx(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    source: &Todo,
    project_id: Option<String>,
    area_id: Option<String>,
) -> Result<String, sqlx::Error> {
    let now = now_iso();
    let new_id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO todos (id, text, note, list, status, priority, recurrence, recur_interval, \
         recur_weekday, recur_weekdays, recur_setpos, recur_mode, scheduled_for, due_date, \
         remind_at, project_id, area_id, heading_id, this_evening, someday, needs_embedding, \
         created_at, updated_at) \
         VALUES (?, ?, ?, NULL, 'pending', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, 0, 0, 1, ?, ?)",
    )
    .bind(&new_id)
    .bind(&source.text)
    .bind(&source.note)
    .bind(source.priority)
    .bind(source.recurrence)
    .bind(source.recur_interval)
    .bind(source.recur_weekday)
    .bind(&source.recur_weekdays)
    .bind(source.recur_setpos)
    .bind(source.recur_mode)
    .bind(&project_id)
    .bind(&area_id)
    .bind(&now)
    .bind(&now)
    .execute(&mut **tx)
    .await?;

    for sub in &source.sub_tasks {
        sqlx::query(
            "INSERT INTO sub_tasks (id, todo_id, text, done, position, created_at) \
             VALUES (?, ?, ?, 0, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&new_id)
        .bind(&sub.text)
        .bind(sub.position)
        .bind(&now)
        .execute(&mut **tx)
        .await?;
    }

    for tag in &source.tags {
        sqlx::query("INSERT OR IGNORE INTO task_tags (todo_id, tag_id) VALUES (?, ?)")
            .bind(&new_id)
            .bind(&tag.id)
            .execute(&mut **tx)
            .await?;
    }

    Ok(new_id)
}

/// Duplique une tâche isolée (menu contextuel) : même projet/domaine que
/// l'original.
pub async fn duplicate_todo(pool: &SqlitePool, id: &str) -> Result<Todo, sqlx::Error> {
    let source = get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    let mut tx = pool.begin().await?;
    let new_id = duplicate_todo_tx(
        &mut tx,
        &source,
        source.project_id.clone(),
        source.area_id.clone(),
    )
    .await?;
    tx.commit().await?;
    get(pool, &new_id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Duplique un projet AVEC toutes ses tâches — y compris terminées, remises à
/// zéro : un projet achevé est le candidat n°1 à devenir un gabarit (« Voyage »
/// bouclé le mois dernier, dupliqué pour le prochain). Le projet copié porte
/// le suffixe « (copie) » (deux projets identiques dans le rail prêteraient à
/// confusion) ; ses tâches, elles, gardent leur nom exact.
pub async fn duplicate_project(pool: &SqlitePool, id: &str) -> Result<Project, sqlx::Error> {
    let source = get_project(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    let tasks = {
        let query = format!("SELECT {SELECT_COLUMNS} FROM todos WHERE project_id = ?");
        let rows = sqlx::query_as::<_, Todo>(&query)
            .bind(id)
            .fetch_all(pool)
            .await?;
        attach_relations(pool, rows).await?
    };

    let mut tx = pool.begin().await?;
    let now = now_iso();
    let new_project_id = Uuid::new_v4().to_string();
    let new_name = format!("{} (copie)", source.name);
    let (max,): (Option<i64>,) = sqlx::query_as("SELECT MAX(position) FROM projects")
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO projects (id, name, note, area_id, status, deadline, position, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?)",
    )
    .bind(&new_project_id)
    .bind(&new_name)
    .bind(&source.note)
    .bind(&source.area_id)
    .bind(max.map(|p| p + 1).unwrap_or(0))
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    for task in &tasks {
        duplicate_todo_tx(&mut tx, task, Some(new_project_id.clone()), None).await?;
    }

    tx.commit().await?;
    get_project(pool, &new_project_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
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
    if let Some(interval) = input.recur_interval {
        sep.push("recur_interval = ").push_bind_unseparated(interval.max(1));
    }
    if let Some(weekday) = input.recur_weekday {
        sep.push("recur_weekday = ").push_bind_unseparated(weekday);
    }
    if let Some(weekdays) = input.recur_weekdays.clone() {
        // Une chaîne vide vaut NULL : `parse_list` n'a ainsi qu'un seul cas
        // d'absence à connaître. C'est un repli défensif, pas le contrat —
        // pour retirer l'ensemble, on envoie `null` comme partout ailleurs.
        let stored = weekdays.filter(|w| !w.trim().is_empty());
        sep.push("recur_weekdays = ").push_bind_unseparated(stored);
    }
    if let Some(setpos) = input.recur_setpos {
        sep.push("recur_setpos = ").push_bind_unseparated(setpos);
    }
    if let Some(mode) = input.recur_mode {
        sep.push("recur_mode = ").push_bind_unseparated(mode);
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
        // Base du report : la date planifiée (règle fixe), ou le jour où l'on
        // coche (« 3 semaines après complétion » se compte depuis MAINTENANT).
        let base = match current.recur_mode {
            crate::models::RecurMode::AfterCompletion => chrono::Local::now().date_naive(),
            crate::models::RecurMode::Fixed => current
                .scheduled_for
                .as_deref()
                .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
                .unwrap_or_else(|| chrono::Local::now().date_naive()),
        };

        let rule = crate::models::RecurrenceRule {
            recurrence: current.recurrence,
            interval: current.recur_interval,
            weekday: current.recur_weekday,
            setpos: current.recur_setpos,
            weekdays: crate::models::RecurWeekday::parse_list(
                current.recur_weekdays.as_deref(),
            ),
        };

        if let Some(next) = rule.advance(base) {
            let next_str = next.format("%Y-%m-%d").to_string();
            // Delta appliqué au rappel et à l'échéance : depuis l'ANCIENNE date
            // planifiée (leurs écarts s'y rattachent), pas depuis la base de
            // calcul — en après-complétion, base = aujourd'hui, et un décalage
            // « next - aujourd'hui » fausserait les écarts.
            let anchor = current
                .scheduled_for
                .as_deref()
                .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
                .unwrap_or(base);
            let shift = next - anchor;
            // Décale le rappel de la même durée (conserve l'heure) et le réarme.
            let next_remind = current.remind_at.as_deref().and_then(|s| {
                chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
                    .ok()
                    .map(|dt| (dt + shift).format("%Y-%m-%dT%H:%M").to_string())
            });
            // L'échéance suit la sémantique « due N jours après l'occurrence » :
            // le delta préserve EXACTEMENT l'écart due-planifiée à chaque saut,
            // y compris sur des règles positionnelles où « le même jour du
            // mois » n'aurait pas de sens. Jamais inventée si absente.
            let next_due = current.due_date.as_deref().and_then(|s| {
                chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .ok()
                    .map(|d| (d + shift).format("%Y-%m-%d").to_string())
            });
            sqlx::query(
                "UPDATE todos SET scheduled_for = ?, due_date = ?, remind_at = ?, reminded = 0, \
                 needs_embedding = 1, updated_at = ? WHERE id = ?",
            )
            .bind(&next_str)
            .bind(&next_due)
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
// Bookkeeping embeddings (héritage D3) : le pipeline sidecar Python qui
// consommait ce flag (`vectorizer.rs`) a été retiré (Phase R). Le flag
// `needs_embedding`/la file `pending_deindex` (posée par `queue_deindex` sur
// suppression) et le texte combiné construit ici sont GARDÉS : c'est
// exactement ce que R3 (embeddings locaux en Rust, `fastembed-rs`) réutilisera
// pour savoir quoi (ré)indexer. Seule la moitié « lecture pour le sidecar »
// (endpoints `/index`/`/deindex` côté Python) a disparu avec lui.
// ---------------------------------------------------------------------------

/// Tâche ou note prête à être (ré)indexée.
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

// ---------------------------------------------------------------------------
// Réglages (table clé/valeur) + digest quotidien
// ---------------------------------------------------------------------------

const DIGEST_ENABLED_KEY: &str = "daily_digest_enabled";
const DIGEST_TIME_KEY: &str = "daily_digest_time";
const DIGEST_LAST_SENT_KEY: &str = "daily_digest_last_sent";
const GROQ_API_KEY_KEY: &str = "groq_api_key";
const AI_PROVIDER_KEY: &str = "ai_provider";

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
    if let Some(v) = get_setting(pool, GROQ_API_KEY_KEY).await? {
        if !v.is_empty() {
            s.groq_api_key = Some(v);
        }
    }
    if let Some(v) = get_setting(pool, AI_PROVIDER_KEY).await? {
        s.ai_provider = v;
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
    if let Some(key) = input.groq_api_key {
        set_setting(pool, GROQ_API_KEY_KEY, &key).await?;
    }
    if let Some(provider) = input.ai_provider {
        set_setting(pool, AI_PROVIDER_KEY, &provider).await?;
    }
    get_settings(pool).await
}

/// Tâches à inclure dans le digest : à faire et planifiées pour aujourd'hui/en
/// retard, OU dont l'échéance est atteinte — les mêmes que la vue Aujourd'hui
/// fait remonter. `someday = 0` : « Un jour » prime dans le regroupement, le
/// digest ne doit pas annoncer des tâches que la vue refuse d'afficher.
pub async fn digest_tasks(pool: &SqlitePool, today: &str) -> Result<Vec<Todo>, sqlx::Error> {
    let query = format!(
        "SELECT {SELECT_COLUMNS} FROM todos \
         WHERE status = 'pending' AND someday = 0 AND \
           ((scheduled_for IS NOT NULL AND scheduled_for <= ?) \
            OR (due_date IS NOT NULL AND due_date <= ?)) \
         ORDER BY scheduled_for ASC, created_at ASC"
    );
    sqlx::query_as::<_, Todo>(&query)
        .bind(today)
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
// Journal (Phase P) : blocs horodatés, remplace les Notes
// ---------------------------------------------------------------------------

const JOURNAL_ENTRY_COLUMNS: &str =
    "id, target_day, written_at, content, created_at, updated_at";

/// Peuple les tags de chaque bloc — même mécanique que `attach_relations`
/// pour les tâches (une requête par bloc, volumes personnels négligeables).
async fn attach_journal_relations(
    pool: &SqlitePool,
    mut entries: Vec<JournalEntry>,
) -> Result<Vec<JournalEntry>, sqlx::Error> {
    for entry in &mut entries {
        entry.tags = list_journal_entry_tags(pool, &entry.id).await?;
    }
    Ok(entries)
}

/// Blocs d'une page-jour, triés par heure d'écriture.
pub async fn list_journal_entries_for_day(
    pool: &SqlitePool,
    day: &str,
) -> Result<Vec<JournalEntry>, sqlx::Error> {
    let query = format!(
        // `created_at` départage : une scission donne à la seconde moitié
        // l'heure de la première, et deux blocs à la même heure doivent
        // malgré tout garder un ordre stable — celui de leur apparition.
        "SELECT {JOURNAL_ENTRY_COLUMNS} FROM journal_entries WHERE target_day = ? \
         ORDER BY written_at ASC, created_at ASC"
    );
    let entries = sqlx::query_as::<_, JournalEntry>(&query)
        .bind(day)
        .fetch_all(pool)
        .await?;
    attach_journal_relations(pool, entries).await
}

/// Tout le journal, du plus ancien au plus récent — pour l'export.
///
/// Sans les tags : `attach_journal_relations` fait une requête PAR bloc, et
/// l'export en lit des milliers d'un coup. L'export ne rend d'ailleurs pas
/// les tags, la page non plus depuis qu'elle est un document.
pub async fn list_all_journal_entries(
    pool: &SqlitePool,
) -> Result<Vec<JournalEntry>, sqlx::Error> {
    let query = format!(
        "SELECT {JOURNAL_ENTRY_COLUMNS} FROM journal_entries \
         ORDER BY target_day ASC, written_at ASC, created_at ASC"
    );
    sqlx::query_as::<_, JournalEntry>(&query).fetch_all(pool).await
}

/// Blocs écrits en avance : `target_day` strictement après `after_day`.
pub async fn list_upcoming_journal_entries(
    pool: &SqlitePool,
    after_day: &str,
) -> Result<Vec<JournalEntry>, sqlx::Error> {
    let query = format!(
        "SELECT {JOURNAL_ENTRY_COLUMNS} FROM journal_entries WHERE target_day > ? \
         ORDER BY target_day ASC, written_at ASC, created_at ASC"
    );
    let entries = sqlx::query_as::<_, JournalEntry>(&query)
        .bind(after_day)
        .fetch_all(pool)
        .await?;
    attach_journal_relations(pool, entries).await
}

/// Compte les blocs par jour sur un mois (`YYYY-MM`).
///
/// Bornes de chaîne plutôt qu'un `LIKE` : `target_day` est un `YYYY-MM-DD`
/// trié lexicographiquement comme chronologiquement, l'index de la colonne
/// sert donc l'intervalle. Les jours SANS bloc ne sont pas renvoyés — c'est à
/// l'appelant de dessiner les creux, il connaît la longueur du mois.
pub async fn count_journal_entries_by_month(
    pool: &SqlitePool,
    month: &str,
) -> Result<Vec<JournalDayCount>, sqlx::Error> {
    sqlx::query_as::<_, JournalDayCount>(
        "SELECT target_day AS day, COUNT(*) AS count FROM journal_entries \
         WHERE target_day >= ? AND target_day <= ? \
         GROUP BY target_day ORDER BY target_day ASC",
    )
    .bind(format!("{month}-01"))
    .bind(format!("{month}-31"))
    .fetch_all(pool)
    .await
}

pub async fn get_journal_entry(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<JournalEntry>, sqlx::Error> {
    let query = format!("SELECT {JOURNAL_ENTRY_COLUMNS} FROM journal_entries WHERE id = ?");
    let entry = sqlx::query_as::<_, JournalEntry>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await?;
    match entry {
        Some(mut e) => {
            e.tags = list_journal_entry_tags(pool, &e.id).await?;
            Ok(Some(e))
        }
        None => Ok(None),
    }
}

pub async fn create_journal_entry(
    pool: &SqlitePool,
    input: CreateJournalEntry,
) -> Result<JournalEntry, sqlx::Error> {
    let now = now_iso();
    let entry = JournalEntry {
        id: Uuid::new_v4().to_string(),
        target_day: input.target_day,
        written_at: input.written_at.unwrap_or_else(|| now.clone()),
        content: input.content,
        created_at: now.clone(),
        updated_at: now,
        tags: Vec::new(),
    };

    sqlx::query(
        "INSERT INTO journal_entries (id, target_day, written_at, content, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&entry.id)
    .bind(&entry.target_day)
    .bind(&entry.written_at)
    .bind(&entry.content)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(pool)
    .await?;

    Ok(entry)
}

/// Le dossier des pièces, à côté de la base.
///
/// Les fichiers ne vont PAS dans SQLite : une photo de trois méga-octets par
/// ligne rendrait chaque lecture de la journée coûteuse, et la sauvegarde du
/// journal impossible à copier à la main. Le disque garde les octets, la base
/// garde le nom.
pub fn dossier_pieces(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("pieces");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Les extensions qu'on accepte comme image.
///
/// Une liste EXPLICITE, pas une devinette sur le type MIME : c'est le webview
/// qui affichera le fichier, et il n'affiche que ce qu'il sait décoder. Un
/// fichier accepté puis muet à l'écran serait pire qu'un fichier refusé.
const IMAGES: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "avif"];

/// Les documents qu'une journée reçoit : un bail, une facture, un article, un
/// tableur, des notes.
///
/// Pas d'archives : un `.zip` n'est pas ce qu'on pose dans un journal, et
/// l'accepter inviterait à y déposer quatre gigaoctets — la pièce est COPIÉE,
/// le poids reste.
const DOCUMENTS: [&str; 13] = [
    "doc", "docx", "odt", "rtf", "txt", "md", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp",
];

/// La nature d'un fichier, d'après son extension.
///
/// Le PDF a sa propre nature parce qu'il est le seul qui s'APERÇOIT : sa
/// première page se rend en image. Les autres documents se nomment, ils ne se
/// montrent pas — il faudrait un moteur de rendu par format.
pub fn nature(nom: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(nom)
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase();
    if IMAGES.contains(&ext.as_str()) {
        return Some("image");
    }
    if ext == "pdf" {
        return Some("pdf");
    }
    if DOCUMENTS.contains(&ext.as_str()) {
        return Some("document");
    }
    None
}

/// Enregistre des octets comme pièce jointe et rend sa fiche.
///
/// Le nom sur le disque est un UUID : deux photos appelées `IMG_4821.jpg` ne
/// doivent pas se recouvrir. Le nom d'origine est gardé à côté — c'est lui
/// qu'on reconnaît, et celui qu'on rendra à l'export.
pub async fn create_journal_piece(
    pool: &SqlitePool,
    dossier: &std::path::Path,
    nom_origine: &str,
    octets: &[u8],
) -> Result<JournalPiece, String> {
    let Some(kind) = nature(nom_origine) else {
        return Err(format!("« {nom_origine} » n'est pas un fichier que Listik sait ranger."));
    };
    let ext = std::path::Path::new(nom_origine)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();

    let id = Uuid::new_v4().to_string();
    let fichier = format!("{id}.{ext}");
    let chemin = dossier.join(&fichier);
    std::fs::write(&chemin, octets).map_err(|e| e.to_string())?;

    let created_at = now_iso();
    let taille = octets.len() as i64;
    sqlx::query(
        "INSERT INTO journal_pieces (id, kind, fichier, nom_origine, taille, created_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(kind)
    .bind(&fichier)
    .bind(nom_origine)
    .bind(taille)
    .bind(&created_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(JournalPiece {
        id,
        kind: kind.to_string(),
        nom_origine: nom_origine.to_string(),
        chemin: chemin.to_string_lossy().into_owned(),
        taille: Some(taille),
        created_at,
    })
}

/// Les fiches de plusieurs pièces, dans l'ordre demandé.
///
/// Le document ne porte que des identifiants : c'est ici qu'ils redeviennent
/// des fichiers. Un identifiant inconnu est simplement ABSENT du résultat —
/// une pièce supprimée hors de l'app ne doit pas faire échouer la journée
/// entière.
pub async fn list_journal_pieces(
    pool: &SqlitePool,
    dossier: &std::path::Path,
    ids: &[String],
) -> Result<Vec<JournalPiece>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT id, kind, fichier, nom_origine, taille, created_at FROM journal_pieces WHERE id IN (",
    );
    let mut sep = qb.separated(", ");
    for id in ids {
        sep.push_bind(id);
    }
    qb.push(")");

    let lignes = qb
        .build_query_as::<(String, String, String, String, Option<i64>, String)>()
        .fetch_all(pool)
        .await?;

    Ok(lignes
        .into_iter()
        .map(|(id, kind, fichier, nom_origine, taille, created_at)| JournalPiece {
            id,
            kind,
            nom_origine,
            chemin: dossier.join(fichier).to_string_lossy().into_owned(),
            taille,
            created_at,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Export du journal (Markdown + dossier de pièces voisin)
// ---------------------------------------------------------------------------

/// Les identifiants de pièces cités par un texte, dans l'ordre.
///
/// Un balayage à la main plutôt qu'une dépendance à `regex` : la syntaxe est
/// la nôtre — `![légende](piece:<id>)`, fixée par le transformeur de
/// `features/journal/feuille.ts` — et tient en une recherche de sous-chaîne.
pub fn ids_pieces(markdown: &str) -> Vec<String> {
    const OUVERTURE: &str = "](piece:";
    let mut out = Vec::new();
    let mut reste = markdown;
    while let Some(i) = reste.find(OUVERTURE) {
        let apres = &reste[i + OUVERTURE.len()..];
        let Some(j) = apres.find(')') else { break };
        out.push(apres[..j].to_string());
        reste = &apres[j..];
    }
    out
}

/// `capture.png`, puis `capture-2.png`.
///
/// Deux photos peuvent porter le même nom d'origine — c'est même pour ça que
/// le disque les range sous un UUID. À l'export on rend le nom lisible, celui
/// qu'on reconnaît ; il faut donc départager les homonymes plutôt qu'en
/// écraser un silencieusement.
pub fn nom_unique(pris: &mut std::collections::HashSet<String>, nom_origine: &str) -> String {
    let p = std::path::Path::new(nom_origine);
    let tige = p.file_stem().and_then(|s| s.to_str()).unwrap_or("piece");
    let ext = p.extension().and_then(|s| s.to_str());
    let compose = |n: u32| match (n, ext) {
        (1, Some(e)) => format!("{tige}.{e}"),
        (1, None) => tige.to_string(),
        (n, Some(e)) => format!("{tige}-{n}.{e}"),
        (n, None) => format!("{tige}-{n}"),
    };
    let mut n = 1;
    while pris.contains(&compose(n)) {
        n += 1;
    }
    let nom = compose(n);
    pris.insert(nom.clone());
    nom
}

const JOURS: [&str; 7] = [
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];
const MOIS: [&str; 12] = [
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
    "septembre", "octobre", "novembre", "décembre",
];

/// « mardi 8 septembre 2026 » — la date telle que la porte l'en-tête de la page.
fn jour_en_francais(iso: &str) -> String {
    use chrono::Datelike;
    match chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d") {
        Ok(d) => format!(
            "{} {} {} {}",
            JOURS[d.weekday().num_days_from_monday() as usize],
            d.day(),
            MOIS[d.month0() as usize],
            d.year()
        ),
        // Une date qu'on ne sait pas lire vaut mieux telle quelle qu'effacée.
        Err(_) => iso.to_string(),
    }
}

/// L'heure d'écriture, à l'heure de celui qui exporte.
///
/// `written_at` est en UTC (`now_iso`) ; la page l'a toujours affichée en
/// heure locale. Un export qui décalerait tout de deux heures raconterait une
/// autre journée que celle qu'on a sous les yeux.
fn heure_locale(iso: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|t| t.with_timezone(&chrono::Local).format("%H:%M").to_string())
}

/// Une cible de lien Markdown, entre chevrons si elle contient de quoi la
/// casser. `![x](mes photos/a.png)` ne se lit nulle part ; `<…>` est la forme
/// prévue par CommonMark pour ça.
fn cible_lien(cible: &str) -> String {
    if cible.contains([' ', '(', ')']) {
        format!("<{cible}>")
    } else {
        cible.to_string()
    }
}

/// Ce qu'une pièce devient dans l'export.
pub struct Sortie {
    /// Son nom dans le dossier voisin. `None` quand la copie a échoué — le
    /// fichier avait disparu du disque.
    pub fichier: Option<String>,
    /// Une image se MONTRE (`![…]`), un document se CITE (`[…]`) : un lecteur
    /// de Markdown à qui l'on donne `![](bail.pdf)` n'affiche rien du tout.
    pub image: bool,
    /// Le nom d'origine. Il fait le texte du lien quand un document n'a pas de
    /// légende : `[](bail.pdf)` serait un lien sans prise.
    pub nom: String,
}

/// Remplace les renvois internes par des liens vers le dossier voisin.
///
/// `piece:<id>` est un schéma PRIVÉ : hors de l'app il ne pointe nulle part.
/// Une pièce dont le fichier a disparu laisse son texte en clair — mieux vaut
/// une phrase orpheline qu'un lien mort.
fn reecrire_pieces(
    contenu: &str,
    sorties: &std::collections::HashMap<String, Sortie>,
    dossier: &str,
) -> String {
    const OUVERTURE: &str = "](piece:";
    let mut out = String::with_capacity(contenu.len());
    let mut reste = contenu;

    while let Some(i) = reste.find("![") {
        let apres = &reste[i + 2..];
        // La légende s'arrête au premier `]`, comme dans le transformeur qui
        // l'a écrite (`[^\]]*`).
        let cible = apres.find(']').map(|j| (j, &apres[j..]));
        let Some((j, queue)) = cible.filter(|(_, q)| q.starts_with(OUVERTURE)) else {
            // Un `![` qui n'ouvre pas une de nos pièces : on le laisse passer.
            out.push_str(&reste[..i + 2]);
            reste = apres;
            continue;
        };
        let Some(k) = queue.find(')') else {
            out.push_str(&reste[..i + 2]);
            reste = apres;
            continue;
        };

        let legende = &apres[..j];
        let id = &queue[OUVERTURE.len()..k];
        out.push_str(&reste[..i]);
        match sorties.get(id) {
            Some(s) => {
                // Une image sans légende reste une image — `![]` est valide et
                // porte le fichier. Un document sans légende n'aurait aucun
                // texte à cliquer : c'est son nom qui le fait.
                let texte = match (s.image, legende.is_empty()) {
                    (false, true) => s.nom.as_str(),
                    _ => legende,
                };
                match &s.fichier {
                    Some(fichier) => out.push_str(&format!(
                        "{}[{texte}]({})",
                        if s.image { "!" } else { "" },
                        cible_lien(&format!("{dossier}/{fichier}"))
                    )),
                    // Le fichier a disparu : il reste ce qu'on en disait.
                    None => out.push_str(texte),
                }
            }
            None => out.push_str(legende),
        }
        reste = &queue[k + 1..];
    }

    out.push_str(reste);
    out
}

/// Écrit l'export : le document à `cible`, les photos dans le dossier voisin.
///
/// Séparé de la commande pour être testable : c'est ici que se joue tout ce
/// qui peut mal tourner — un nom de fichier en double, une photo disparue du
/// disque, un dossier à créer — et rien de tout cela ne demande une fenêtre
/// Tauri pour être vérifié.
pub fn ecrire_export(
    cible: &std::path::Path,
    entries: &[JournalEntry],
    fiches: &[JournalPiece],
) -> Result<JournalExport, String> {
    let nom_dossier = format!(
        "{}-pieces",
        cible.file_stem().and_then(|s| s.to_str()).unwrap_or("journal")
    );

    let mut sorties: std::collections::HashMap<String, Sortie> = std::collections::HashMap::new();
    let mut copiees = 0u32;
    if !fiches.is_empty() {
        let dossier = cible.with_file_name(&nom_dossier);
        std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
        let mut pris = std::collections::HashSet::new();
        for f in fiches {
            let nom = nom_unique(&mut pris, &f.nom_origine);
            // Une pièce disparue du disque n'arrête pas l'export : elle entre
            // quand même dans la table, sans fichier, pour que le document
            // garde une trace de ce qu'il y avait là.
            let fichier = if std::fs::copy(&f.chemin, dossier.join(&nom)).is_ok() {
                copiees += 1;
                Some(nom)
            } else {
                pris.remove(&nom);
                None
            };
            sorties.insert(
                f.id.clone(),
                Sortie {
                    fichier,
                    image: f.kind == "image",
                    nom: f.nom_origine.clone(),
                },
            );
        }
    }

    std::fs::write(cible, markdown_du_journal(entries, &sorties, &nom_dossier))
        .map_err(|e| e.to_string())?;

    let mut jours: Vec<&str> = entries.iter().map(|e| e.target_day.as_str()).collect();
    jours.dedup();
    Ok(JournalExport {
        jours: jours.len() as u32,
        pieces: copiees,
    })
}

/// Rend le journal entier en UN document Markdown.
///
/// Un seul fichier, et les jours en `##` : le modèle veut que la journée soit
/// un document, et une reprise n'est qu'un moment à l'intérieur. La découper
/// en un fichier par bloc rendrait à l'export ce que la page a justement
/// cessé de montrer.
///
/// `sorties` dit, pour chaque identifiant de pièce, ce qu'elle devient dans le
/// dossier voisin `dossier`.
pub fn markdown_du_journal(
    entries: &[JournalEntry],
    sorties: &std::collections::HashMap<String, Sortie>,
    dossier: &str,
) -> String {
    let mut out = String::from("# Journal\n\n");
    let mut jour_courant = "";

    for e in entries {
        // On rogne APRÈS la réécriture : une pièce introuvable en tête de bloc
        // s'efface, et laisserait sinon ses lignes vides derrière elle.
        let corps = reecrire_pieces(&e.content, sorties, dossier).trim().to_string();
        // Un bloc vidé mais jamais effacé ne mérite pas une heure à lui seul.
        if corps.trim().is_empty() {
            continue;
        }
        if e.target_day != jour_courant {
            out.push_str(&format!("## {}\n\n", jour_en_francais(&e.target_day)));
            jour_courant = &e.target_day;
        }
        // L'heure en italique, pas en titre : c'est la gouttière de la page,
        // une indication en marge — pas un niveau de plan qui se mêlerait aux
        // titres écrits par l'utilisateur.
        if let Some(h) = heure_locale(&e.written_at) {
            out.push_str(&format!("*{h}*\n\n"));
        }
        out.push_str(&corps);
        out.push_str("\n\n");
    }

    out
}

/// Ce qui encadre les occurrences dans un extrait. Deux caractères qu'on
/// n'écrit pas dans un journal — sinon le front les prendrait pour du texte.
pub const MARQUE_DEBUT: &str = "\u{2506}";
pub const MARQUE_FIN: &str = "\u{2507}";

/// Traduit une saisie humaine en requête FTS5.
///
/// MATCH a sa propre syntaxe : guillemets, étoile, opérateurs booléens, tiret
/// de négation. Passer la saisie telle quelle, c'est une erreur SQL dès qu'on
/// tape un guillemet — et la recherche semble cassée sans qu'on comprenne
/// pourquoi.
///
/// On cite donc chaque mot (ce qui neutralise tout opérateur), et le DERNIER
/// reçoit une étoile : on cherche pendant qu'on tape, et « gara » doit déjà
/// trouver « garage ».
///
/// Rend `None` quand il ne reste rien à chercher — à l'appelant de ne pas
/// interroger la base pour une chaîne vide.
pub fn requete_fts(saisie: &str) -> Option<String> {
    let mots: Vec<String> = saisie
        .split_whitespace()
        .map(|m| m.replace('"', ""))
        .filter(|m| !m.is_empty())
        .collect();
    if mots.is_empty() {
        return None;
    }
    let dernier = mots.len() - 1;
    Some(
        mots.iter()
            .enumerate()
            .map(|(i, m)| {
                if i == dernier {
                    format!("\"{m}\"*")
                } else {
                    format!("\"{m}\"")
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

/// Cherche un passage dans tout le journal.
///
/// Classe par date DÉCROISSANTE, pas par pertinence : dans un journal on
/// cherche « quand ai-je parlé de ça », et la réponse la plus utile est la
/// plus récente. Un score bm25 mettrait en tête un jour d'il y a trois ans
/// parce qu'il répète le mot.
pub async fn search_journal(
    pool: &SqlitePool,
    saisie: &str,
    limite: i64,
) -> Result<Vec<JournalHit>, sqlx::Error> {
    let Some(requete) = requete_fts(saisie) else {
        return Ok(Vec::new());
    };
    sqlx::query_as::<_, JournalHit>(
        "SELECT e.id, e.target_day, e.written_at, \
                snippet(journal_fts, 0, ?, ?, '…', 14) AS extrait \
         FROM journal_fts f \
         JOIN journal_entries e ON e.rowid = f.rowid \
         WHERE journal_fts MATCH ? \
         ORDER BY e.written_at DESC, e.created_at DESC \
         LIMIT ?",
    )
    .bind(MARQUE_DEBUT)
    .bind(MARQUE_FIN)
    .bind(requete)
    .bind(limite)
    .fetch_all(pool)
    .await
}

/// Fenêtre d'une REPRISE d'écriture.
///
/// Un bloc du Journal n'est pas un paragraphe : c'est une SESSION. Tant qu'on
/// écrit sans s'interrompre plus d'une heure, tout va dans le même bloc — le
/// texte y coule comme dans un document. Passé ce délai, on est revenu, et
/// c'est un autre moment de la journée.
pub const REPRISE: chrono::Duration = chrono::Duration::hours(1);

/// Ouvre la session d'écriture du jour : la dernière encore chaude, ou une
/// nouvelle.
///
/// La règle vit ICI et pas dans la page, parce que deux fenêtres écrivent dans
/// le journal — la page-jour et la capture rapide (`/note`). Chacune décidant
/// de son côté sur sa copie de la liste, deux moments simultanés se seraient
/// coupés en deux blocs, ou pire, mélangés.
///
/// `content` vide (le cas de la page, qui veut juste où poser le curseur) ne
/// touche à rien : elle rend la session telle quelle. Sinon le texte est
/// ajouté au bout, séparé par une ligne vide — sans quoi le markdown souderait
/// les deux paragraphes en un seul.
pub async fn append_journal_entry(
    pool: &SqlitePool,
    target_day: &str,
    content: &str,
) -> Result<JournalEntry, sqlx::Error> {
    let ouverte = derniere_session_ouverte(pool, target_day).await?;

    let Some(entry) = ouverte else {
        return create_journal_entry(
            pool,
            CreateJournalEntry {
                target_day: target_day.to_string(),
                content: content.to_string(),
                written_at: None,
            },
        )
        .await;
    };

    if content.is_empty() {
        return Ok(entry);
    }

    let fusion = if entry.content.is_empty() {
        content.to_string()
    } else {
        format!("{}

{}", entry.content, content)
    };
    update_journal_entry(
        pool,
        &entry.id,
        UpdateJournalEntry {
            target_day: None,
            content: Some(fusion),
        },
    )
    .await
}

/// Le dernier bloc du jour, s'il a été écrit il y a moins d'une `REPRISE`.
///
/// On mesure sur `updated_at` — la dernière écriture RÉELLE, pas le début de
/// la session : rester une heure et demie sur un même bloc ne doit pas le
/// fermer sous les doigts. (Vérifié : ouvrir un jour ne le bouge pas, seule
/// une modification de contenu le fait.)
async fn derniere_session_ouverte(
    pool: &SqlitePool,
    target_day: &str,
) -> Result<Option<JournalEntry>, sqlx::Error> {
    let query = format!(
        "SELECT {JOURNAL_ENTRY_COLUMNS} FROM journal_entries WHERE target_day = ?          ORDER BY written_at DESC, created_at DESC LIMIT 1"
    );
    let derniere = sqlx::query_as::<_, JournalEntry>(&query)
        .bind(target_day)
        .fetch_optional(pool)
        .await?;

    let Some(entry) = derniere else {
        return Ok(None);
    };
    if !session_ouverte(&entry.updated_at, &now_iso()) {
        return Ok(None);
    }
    let mut entry = entry;
    entry.tags = list_journal_entry_tags(pool, &entry.id).await?;
    Ok(Some(entry))
}

/// Deux instants ISO appartiennent-ils à la même reprise ?
///
/// Une date illisible rend `false` : on ouvre alors un bloc neuf plutôt que
/// d'écrire dans un dont on ne sait rien.
pub fn session_ouverte(derniere_ecriture: &str, maintenant: &str) -> bool {
    let (Ok(a), Ok(b)) = (
        chrono::DateTime::parse_from_rfc3339(derniere_ecriture),
        chrono::DateTime::parse_from_rfc3339(maintenant),
    ) else {
        return false;
    };
    let ecart = b.signed_duration_since(a);
    ecart >= chrono::Duration::zero() && ecart < REPRISE
}

pub async fn update_journal_entry(
    pool: &SqlitePool,
    id: &str,
    input: UpdateJournalEntry,
) -> Result<JournalEntry, sqlx::Error> {
    let now = now_iso();

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE journal_entries SET ");
    let mut sep = qb.separated(", ");

    if let Some(target_day) = input.target_day {
        sep.push("target_day = ").push_bind_unseparated(target_day);
    }
    if let Some(content) = input.content {
        sep.push("content = ").push_bind_unseparated(content);
    }
    sep.push("updated_at = ").push_bind_unseparated(now);
    qb.push(" WHERE id = ").push_bind(id);
    qb.build().execute(pool).await?;

    get_journal_entry(pool, id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_journal_entry(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM journal_entry_tags WHERE entry_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM journal_entries WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Tags d'un bloc, triés par nom — même requête que `list_todo_tags`.
pub async fn list_journal_entry_tags(
    pool: &SqlitePool,
    entry_id: &str,
) -> Result<Vec<Tag>, sqlx::Error> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.parent_id, t.created_at FROM tags t \
         JOIN journal_entry_tags jt ON jt.tag_id = t.id \
         WHERE jt.entry_id = ? ORDER BY t.name COLLATE NOCASE ASC",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
}

/// Remplace l'intégralité des tags d'un bloc (replace-all) — même sémantique
/// que `set_todo_tags`.
pub async fn set_journal_entry_tags(
    pool: &SqlitePool,
    entry_id: &str,
    tag_ids: &[String],
) -> Result<JournalEntry, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM journal_entry_tags WHERE entry_id = ?")
        .bind(entry_id)
        .execute(&mut *tx)
        .await?;

    for tag_id in tag_ids {
        sqlx::query("INSERT OR IGNORE INTO journal_entry_tags (entry_id, tag_id) VALUES (?, ?)")
            .bind(entry_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    get_journal_entry(pool, entry_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
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
// Ordre manuel par contexte (« la date choisit la section, la position choisit
// l'ordre dans la section »)
// ---------------------------------------------------------------------------

/// Une position d'ordre manuel : `context` ∈ { 'today', 'inbox', 'anytime',
/// 'someday', 'project:<id>' }.
#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../features/todos/generated/")]
pub struct Ordering {
    pub context: String,
    pub todo_id: String,
    #[ts(type = "number")]
    pub position: i64,
}

/// Toutes les positions (table minuscule à l'échelle personnelle : on la lit
/// d'un bloc, le frontend en dérive une map par contexte).
pub async fn get_orderings(pool: &SqlitePool) -> Result<Vec<Ordering>, sqlx::Error> {
    sqlx::query_as::<_, Ordering>(
        "SELECT context, todo_id, position FROM orderings ORDER BY context, position",
    )
    .fetch_all(pool)
    .await
}

/// Remplace l'intégralité de l'ordre d'un contexte (positions 0..n dans
/// l'ordre fourni), en transaction.
///
/// Le remplacement complet fait double emploi : il **auto-cicatrise** — une
/// tâche supprimée ou replanifiée ailleurs disparaît simplement au prochain
/// remplacement (aucun nettoyage en cascade à maintenir), et une ligne
/// périmée est ignorée à la lecture. Pas de positions fractionnaires : rien à
/// rééquilibrer à ~100 lignes par contexte.
pub async fn set_ordering(
    pool: &SqlitePool,
    context: &str,
    ordered_ids: &[String],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM orderings WHERE context = ?")
        .bind(context)
        .execute(&mut *tx)
        .await?;

    for (position, todo_id) in ordered_ids.iter().enumerate() {
        sqlx::query(
            "INSERT OR REPLACE INTO orderings (context, todo_id, position) VALUES (?, ?, ?)",
        )
        .bind(context)
        .bind(todo_id)
        .bind(position as i64)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
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
    sqlx::query("DELETE FROM journal_entry_tags WHERE tag_id = ?")
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
        append_journal_entry, create_journal_piece, delete_journal_entry, ids_pieces,
        ecrire_export, list_journal_entries_for_day, list_journal_pieces, markdown_du_journal,
        nature, nom_unique,
        requete_fts, search_journal, session_ouverte, update_journal_entry, MARQUE_DEBUT,
        MARQUE_FIN, Sortie,
        create, create_area, create_note, create_project, create_subtask, create_tag, delete,
        delete_area, delete_note, delete_project, delete_tag, due_reminders, duplicate_project,
        duplicate_todo, get, get_settings, list_all, list_areas, list_by_date, list_notes,
        list_projects, list_subtasks, list_tags, mark_reminded, reconcile_lists_into_projects,
        search_notes, set_todo_tags, take_due_digest, todos_needing_embedding, toggle, update,
        update_area, update_note, update_project, update_settings, update_subtask, update_tag,
    };
    use crate::models::{
        CreateArea, CreateNote, CreateProject, CreateSubTask, CreateTag, CreateTodo, JournalEntry, JournalPiece,
        TodoStatus, UpdateJournalEntry,
        UpdateArea, UpdateNote, UpdateProject, UpdateSettings, UpdateSubTask, UpdateTag,
        UpdateTodo,
    };
    use sqlx::sqlite::SqlitePoolOptions;
    use uuid::Uuid;
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
            recur_interval: 1,
            recur_weekday: None,
            recur_weekdays: None,
            recur_setpos: None,
            recur_mode: crate::models::RecurMode::Fixed,
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
    async fn update_can_clear_the_weekday_set() {
        use crate::models::Recurrence;
        let pool = memory_pool().await;
        let mut input = new_todo("Sport");
        input.recurrence = Some(Recurrence::Weekly);
        input.recur_weekdays = Some("mon,thu".to_string());
        let todo = create(&pool, input).await.unwrap();
        assert_eq!(todo.recur_weekdays.as_deref(), Some("mon,thu"));

        // Champ absent : l'ensemble survit à une mise à jour qui parle
        // d'autre chose.
        let untouched = update(
            &pool,
            &todo.id,
            UpdateTodo { text: Some("Sport du soir".to_string()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(untouched.recur_weekdays.as_deref(), Some("mon,thu"));

        // `null` retire l'ensemble — même convention que les autres champs
        // annulables, et non plus la chaîne vide.
        let cleared = update(
            &pool,
            &todo.id,
            UpdateTodo { recur_weekdays: Some(None), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(cleared.recur_weekdays, None);
    }

    #[tokio::test]
    async fn update_folds_an_empty_weekday_set_to_null() {
        use crate::models::Recurrence;
        let pool = memory_pool().await;
        let mut input = new_todo("Sport");
        input.recurrence = Some(Recurrence::Weekly);
        input.recur_weekdays = Some("mon,thu".to_string());
        let todo = create(&pool, input).await.unwrap();

        // Repli défensif : une chaîne vide ne doit pas atterrir en base, sinon
        // `parse_list` aurait deux cas d'absence à connaître.
        let cleared = update(
            &pool,
            &todo.id,
            UpdateTodo { recur_weekdays: Some(Some(String::new())), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(cleared.recur_weekdays, None);
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
    async fn toggle_after_completion_counts_from_today_and_keeps_offsets() {
        use crate::models::{RecurMode, Recurrence};
        let pool = memory_pool().await;

        // « 3 semaines après complétion », planifiée dans le passé, échéance
        // 2 jours après la planification.
        let mut input = new_todo("Arroser les plantes");
        input.recurrence = Some(Recurrence::Weekly);
        input.recur_interval = 3;
        input.recur_mode = RecurMode::AfterCompletion;
        input.scheduled_for = Some("2026-06-10".to_string());
        input.due_date = Some("2026-06-12".to_string());
        let todo = create(&pool, input).await.unwrap();

        let after = toggle(&pool, &todo.id).await.unwrap();

        // La prochaine occurrence se compte depuis AUJOURD'HUI, pas depuis la
        // date planifiée dépassée.
        let today = chrono::Local::now().date_naive();
        let expected = (today + chrono::Duration::days(21)).format("%Y-%m-%d").to_string();
        assert_eq!(after.scheduled_for.as_deref(), Some(expected.as_str()));

        // L'écart planifiée→échéance (+2 jours) survit : le delta s'ancre sur
        // l'ANCIENNE date planifiée, pas sur la base de calcul (aujourd'hui).
        let expected_due = (today + chrono::Duration::days(23)).format("%Y-%m-%d").to_string();
        assert_eq!(after.due_date.as_deref(), Some(expected_due.as_str()));
    }

    #[tokio::test]
    async fn toggle_shifts_deadline_by_the_same_delta_and_never_invents_one() {
        use crate::models::Recurrence;
        let pool = memory_pool().await;

        // « Planifiée lundi, due vendredi » : l'écart de 4 jours doit survivre.
        let mut input = new_todo("Rapport hebdo");
        input.recurrence = Some(Recurrence::Weekly);
        input.scheduled_for = Some("2026-06-15".to_string()); // lundi
        input.due_date = Some("2026-06-19".to_string()); // vendredi
        let todo = create(&pool, input).await.unwrap();

        let after = toggle(&pool, &todo.id).await.unwrap();
        assert_eq!(after.scheduled_for.as_deref(), Some("2026-06-22"));
        assert_eq!(after.due_date.as_deref(), Some("2026-06-26"));

        // Sans échéance : elle n'est jamais inventée (l'ancien comportement
        // l'écrasait avec la date planifiée).
        let mut input = new_todo("Sport");
        input.recurrence = Some(Recurrence::Daily);
        input.scheduled_for = Some("2026-06-14".to_string());
        let todo = create(&pool, input).await.unwrap();
        let after = toggle(&pool, &todo.id).await.unwrap();
        assert_eq!(after.scheduled_for.as_deref(), Some("2026-06-15"));
        assert_eq!(after.due_date, None);
    }

    #[tokio::test]
    async fn digest_includes_reached_deadlines_and_excludes_someday() {
        let pool = memory_pool().await;

        // Échéance atteinte, non planifiée → doit figurer au digest.
        let mut due = new_todo("Payer l'assurance");
        due.due_date = Some("2026-06-14".to_string());
        create(&pool, due).await.unwrap();

        // « Un jour » avec date passée : la vue ne l'affiche pas, le digest
        // ne doit pas l'annoncer.
        let mut someday = new_todo("Trier le grenier");
        someday.scheduled_for = Some("2026-06-01".to_string());
        someday.someday = true;
        create(&pool, someday).await.unwrap();

        // Échéance future → pas encore.
        let mut later = new_todo("Déclaration");
        later.due_date = Some("2026-07-01".to_string());
        create(&pool, later).await.unwrap();

        let tasks = super::digest_tasks(&pool, "2026-06-15").await.unwrap();
        let texts: Vec<&str> = tasks.iter().map(|t| t.text.as_str()).collect();
        assert_eq!(texts, ["Payer l'assurance"]);
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
        assert_eq!(defaults.groq_api_key, None);

        let updated = update_settings(
            &pool,
            UpdateSettings {
                daily_digest_enabled: Some(true),
                daily_digest_time: Some("07:30".to_string()),
                ..Default::default()
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
    async fn groq_api_key_persists_and_can_be_cleared() {
        let pool = memory_pool().await;

        let with_key = update_settings(
            &pool,
            UpdateSettings { groq_api_key: Some("gsk_test123".to_string()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(with_key.groq_api_key.as_deref(), Some("gsk_test123"));

        // Absent => inchangé.
        let untouched = update_settings(&pool, UpdateSettings::default()).await.unwrap();
        assert_eq!(untouched.groq_api_key.as_deref(), Some("gsk_test123"));

        // Chaîne vide => efface.
        let cleared = update_settings(
            &pool,
            UpdateSettings { groq_api_key: Some(String::new()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(cleared.groq_api_key, None);
    }

    #[tokio::test]
    async fn ai_provider_defaults_to_claude_and_persists() {
        let pool = memory_pool().await;

        assert_eq!(get_settings(&pool).await.unwrap().ai_provider, "claude");

        let updated = update_settings(
            &pool,
            UpdateSettings { ai_provider: Some("opencode".to_string()), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(updated.ai_provider, "opencode");

        // Absent => inchangé.
        let untouched = update_settings(&pool, UpdateSettings::default()).await.unwrap();
        assert_eq!(untouched.ai_provider, "opencode");
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
                ..Default::default()
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
    async fn duplicate_todo_copies_and_resets() {
        let pool = memory_pool().await;
        let tag = create_tag(&pool, CreateTag { name: "urgent".into(), parent_id: None })
            .await
            .unwrap();

        let mut input = new_todo("Payer le loyer");
        input.note = Some("virement mensuel".into());
        input.priority = Some(crate::models::Priority::High);
        input.recurrence = Some(crate::models::Recurrence::Monthly);
        input.scheduled_for = Some("2026-06-01".to_string());
        input.due_date = Some("2026-06-05".to_string());
        input.remind_at = Some("2026-06-01T09:00".to_string());
        input.project_id = Some("proj-1".into());
        input.someday = false;
        let source = create(&pool, input).await.unwrap();
        set_todo_tags(&pool, &source.id, &[tag.id.clone()]).await.unwrap();
        create_subtask(&pool, CreateSubTask { todo_id: source.id.clone(), text: "Sous-tâche".into() })
            .await
            .unwrap();
        // Coche la sous-tâche : la copie ne doit PAS hériter de son état.
        let subs = list_subtasks(&pool, &source.id).await.unwrap();
        update_subtask(&pool, &subs[0].id, UpdateSubTask { done: Some(true), ..Default::default() })
            .await
            .unwrap();
        // La tâche ORIGINALE est terminée : la copie doit rester à faire.
        let source = update(
            &pool,
            &source.id,
            UpdateTodo { status: Some(crate::models::TodoStatus::Completed), ..Default::default() },
        )
        .await
        .unwrap();

        let copy = duplicate_todo(&pool, &source.id).await.unwrap();

        // Copié : contenu, priorité, règle de récurrence, tags, projet.
        assert_eq!(copy.text, "Payer le loyer");
        assert_eq!(copy.note.as_deref(), Some("virement mensuel"));
        assert!(matches!(copy.priority, crate::models::Priority::High));
        assert!(matches!(copy.recurrence, crate::models::Recurrence::Monthly));
        assert_eq!(copy.project_id.as_deref(), Some("proj-1"));
        assert_eq!(copy.tags.len(), 1);
        assert_eq!(copy.tags[0].name, "urgent");
        assert_eq!(copy.sub_tasks.len(), 1);
        assert!(!copy.sub_tasks[0].done, "la sous-tâche ne doit pas être cochée");

        // Remis à zéro : statut, dates, rappel — un gabarit, pas un clone d'état.
        assert!(matches!(copy.status, TodoStatus::Pending));
        assert_eq!(copy.scheduled_for, None);
        assert_eq!(copy.due_date, None);
        assert_eq!(copy.remind_at, None);

        // Deux tâches distinctes en base, l'originale reste terminée.
        assert_eq!(list_all(&pool).await.unwrap().len(), 2);
        assert!(matches!(get(&pool, &source.id).await.unwrap().unwrap().status, TodoStatus::Completed));
    }

    #[tokio::test]
    async fn duplicate_project_copies_all_tasks_including_completed_and_resets_them() {
        let pool = memory_pool().await;
        let project = create_project(
            &pool,
            CreateProject { name: "Voyage".into(), area_id: None, note: Some("checklist".into()), deadline: None },
        )
        .await
        .unwrap();

        let mut a = new_todo("Réserver l'hôtel");
        a.project_id = Some(project.id.clone());
        a.scheduled_for = Some("2026-06-01".to_string());
        create(&pool, a).await.unwrap();

        let mut b = new_todo("Faire les valises");
        b.project_id = Some(project.id.clone());
        let b = create(&pool, b).await.unwrap();
        // Une tâche déjà terminée : le candidat n°1 à devenir un gabarit.
        toggle(&pool, &b.id).await.unwrap();

        let copy = duplicate_project(&pool, &project.id).await.unwrap();

        assert_eq!(copy.name, "Voyage (copie)");
        assert_eq!(copy.note.as_deref(), Some("checklist"));
        assert!(matches!(copy.status, crate::models::ProjectStatus::Active));

        let all = list_all(&pool).await.unwrap();
        let copied_tasks: Vec<_> = all.iter().filter(|t| t.project_id.as_deref() == Some(&copy.id)).collect();
        assert_eq!(copied_tasks.len(), 2, "les deux tâches, y compris la terminée");
        assert!(
            copied_tasks.iter().all(|t| matches!(t.status, TodoStatus::Pending)),
            "toutes remises à faire, même celle qui était terminée",
        );

        // L'original n'est pas touché.
        assert_eq!(
            all.iter().filter(|t| t.project_id.as_deref() == Some(project.id.as_str())).count(),
            2
        );
    }

    #[tokio::test]
    async fn set_ordering_replaces_the_whole_context() {
        let pool = memory_pool().await;

        super::set_ordering(&pool, "today", &["a".into(), "b".into(), "c".into()])
            .await
            .unwrap();
        // Doublon dans la charge utile : OR REPLACE, pas d'échec.
        super::set_ordering(&pool, "inbox", &["x".into(), "x".into()])
            .await
            .unwrap();

        // Remplacement : « b » disparaît, l'ordre change.
        super::set_ordering(&pool, "today", &["c".into(), "a".into()])
            .await
            .unwrap();

        let all = super::get_orderings(&pool).await.unwrap();
        let today: Vec<(&str, i64)> = all
            .iter()
            .filter(|o| o.context == "today")
            .map(|o| (o.todo_id.as_str(), o.position))
            .collect();
        assert_eq!(today, [("c", 0), ("a", 1)]);
        // L'autre contexte n'est pas touché.
        assert_eq!(all.iter().filter(|o| o.context == "inbox").count(), 1);
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

    #[test]
    fn session_ouverte_suit_la_derniere_ecriture() {
        // Un bloc n'est pas un paragraphe : tant qu'on écrit sans s'arrêter
        // une heure, tout va dans le même moment de la journée.
        assert!(session_ouverte(
            "2026-08-30T10:00:00.000Z",
            "2026-08-30T10:59:00.000Z"
        ));
        assert!(!session_ouverte(
            "2026-08-30T10:00:00.000Z",
            "2026-08-30T11:00:01.000Z"
        ));
        // Le fuseau ne doit pas décider à notre place : deux écritures à la
        // même seconde absolue restent la même reprise.
        assert!(session_ouverte(
            "2026-08-30T12:00:00.000+02:00",
            "2026-08-30T10:30:00.000Z"
        ));
        // Une horloge qui recule ferme la session plutôt que d'écrire dans un
        // bloc « à venir ».
        assert!(!session_ouverte(
            "2026-08-30T11:00:00.000Z",
            "2026-08-30T10:00:00.000Z"
        ));
        // Date illisible : on ouvre un bloc neuf, on n'écrit pas à l'aveugle.
        assert!(!session_ouverte("hier", "2026-08-30T10:00:00.000Z"));
    }

    #[tokio::test]
    async fn append_prolonge_la_reprise_puis_en_ouvre_une_autre() {
        let pool = memory_pool().await;

        let a = append_journal_entry(&pool, "2026-08-30", "Premier jet.")
            .await
            .unwrap();
        let b = append_journal_entry(&pool, "2026-08-30", "La suite, dans la foulée.")
            .await
            .unwrap();
        // Même moment : un seul bloc, deux paragraphes.
        assert_eq!(a.id, b.id);
        assert_eq!(b.content, "Premier jet.

La suite, dans la foulée.");
        assert_eq!(list_journal_entries_for_day(&pool, "2026-08-30").await.unwrap().len(), 1);

        // Un contenu vide ne fait qu'ouvrir la porte : la page veut juste
        // savoir où poser le curseur.
        let c = append_journal_entry(&pool, "2026-08-30", "").await.unwrap();
        assert_eq!(c.id, a.id);
        assert_eq!(c.content, b.content);

        // Écriture d'il y a deux heures : on est revenu, c'est un autre bloc.
        sqlx::query("UPDATE journal_entries SET updated_at = ? WHERE id = ?")
            .bind("2020-01-01T00:00:00.000Z")
            .bind(&a.id)
            .execute(&pool)
            .await
            .unwrap();
        let d = append_journal_entry(&pool, "2026-08-30", "Plus tard.")
            .await
            .unwrap();
        assert_ne!(d.id, a.id);
        assert_eq!(d.content, "Plus tard.");
        assert_eq!(list_journal_entries_for_day(&pool, "2026-08-30").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn append_n_ecrit_pas_dans_le_jour_du_voisin() {
        let pool = memory_pool().await;
        let a = append_journal_entry(&pool, "2026-08-30", "Le trente.").await.unwrap();
        let b = append_journal_entry(&pool, "2026-08-31", "Le trente-et-un.").await.unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(b.content, "Le trente-et-un.");
    }

    #[tokio::test]
    async fn fts5_est_disponible() {
        // Sonde : toute la recherche du journal en depend. Si une montee de
        // version de sqlx retirait FTS5, ce test tomberait avant l'utilisateur.
        let pool = memory_pool().await;
        sqlx::query("CREATE VIRTUAL TABLE sonde USING fts5(x, tokenize = 'unicode61 remove_diacritics 2')")
            .execute(&pool)
            .await
            .expect("FTS5 absent de la build SQLite");
        sqlx::query("INSERT INTO sonde(x) VALUES ('Épicerie du coin')")
            .execute(&pool)
            .await
            .unwrap();
        // Sans diacritiques : « epicerie » doit trouver « Épicerie ».
        let n: (i64,) = sqlx::query_as("SELECT count(*) FROM sonde WHERE sonde MATCH 'epicerie'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n.0, 1);
    }

    #[test]
    fn requete_fts_neutralise_la_syntaxe_de_match() {
        // Chaque mot est cité : un guillemet ou un opérateur tapé par erreur
        // devient du texte, au lieu d'une erreur SQL incompréhensible.
        assert_eq!(requete_fts("garage").unwrap(), "\"garage\"*");
        assert_eq!(requete_fts("le garage").unwrap(), "\"le\" \"garage\"*");
        assert_eq!(requete_fts("  espaces   partout  ").unwrap(), "\"espaces\" \"partout\"*");
        assert_eq!(requete_fts("dit \"bonjour\"").unwrap(), "\"dit\" \"bonjour\"*");
        assert_eq!(requete_fts("a OR b").unwrap(), "\"a\" \"OR\" \"b\"*");
        assert_eq!(requete_fts("-exclu").unwrap(), "\"-exclu\"*");
        // Rien à chercher : on n'interroge pas la base.
        assert!(requete_fts("").is_none());
        assert!(requete_fts("   ").is_none());
        assert!(requete_fts("\"\"").is_none());
    }

    #[tokio::test]
    async fn search_journal_trouve_malgre_les_accents_et_en_cours_de_frappe() {
        let pool = memory_pool().await;
        append_journal_entry(&pool, "2026-08-20", "Passé à l'épicerie du coin.")
            .await
            .unwrap();
        append_journal_entry(&pool, "2026-08-21", "Rien à voir ici.")
            .await
            .unwrap();

        // Sans accent, et sur un mot commencé : la recherche doit suivre la
        // frappe, pas attendre le mot entier.
        for saisie in ["épicerie", "epicerie", "EPICERIE", "epic"] {
            let hits = search_journal(&pool, saisie, 20).await.unwrap();
            assert_eq!(hits.len(), 1, "« {saisie} » n'a rien trouvé");
            assert_eq!(hits[0].target_day, "2026-08-20");
        }

        // L'extrait encadre l'occurrence, pour que le front la mette en valeur.
        let hits = search_journal(&pool, "épicerie", 20).await.unwrap();
        assert!(hits[0].extrait.contains(MARQUE_DEBUT));
        assert!(hits[0].extrait.contains(MARQUE_FIN));

        assert!(search_journal(&pool, "introuvable", 20).await.unwrap().is_empty());
        assert!(search_journal(&pool, "  ", 20).await.unwrap().is_empty());
    }

    /// Un bloc de journal monté à la main — l'export ne lit que ces champs.
    fn bloc(target_day: &str, written_at: &str, content: &str) -> JournalEntry {
        JournalEntry {
            id: Uuid::new_v4().to_string(),
            target_day: target_day.to_string(),
            written_at: written_at.to_string(),
            content: content.to_string(),
            created_at: written_at.to_string(),
            updated_at: written_at.to_string(),
            tags: Vec::new(),
        }
    }

    /// Une pièce copiée sans encombre dans le dossier voisin.
    fn sortie(fichier: &str, image: bool) -> Sortie {
        Sortie {
            fichier: Some(fichier.to_string()),
            image,
            nom: fichier.to_string(),
        }
    }

    #[test]
    fn un_document_se_cite_quand_une_photo_se_montre() {
        // `![](bail.pdf)` n'affiche RIEN chez un lecteur de Markdown : un
        // document est un lien, pas une image.
        let mut sorties = std::collections::HashMap::new();
        sorties.insert("photo".to_string(), sortie("capture.png", true));
        sorties.insert("bail".to_string(), sortie("bail-signe-2026.pdf", false));

        let entries = vec![bloc(
            "2026-09-09",
            "2026-09-09T09:00:00.000Z",
            "![Le muret](piece:photo)\n\n![](piece:bail)\n\n![Relu par le notaire](piece:bail)",
        )];
        let md = markdown_du_journal(&entries, &sorties, "p");

        assert!(md.contains("![Le muret](p/capture.png)"), "{md}");
        // Sans légende, c'est le NOM du fichier qui fait le texte du lien :
        // `[](p/bail…)` serait un lien sans prise.
        assert!(md.contains("[bail-signe-2026.pdf](p/bail-signe-2026.pdf)"), "{md}");
        assert!(md.contains("[Relu par le notaire](p/bail-signe-2026.pdf)"), "{md}");
        // Et jamais la forme image pour un document.
        assert!(!md.contains("![bail"), "{md}");
        assert!(!md.contains("![Relu"), "{md}");
    }

    #[test]
    fn un_document_disparu_garde_son_nom_dans_l_export() {
        // Une photo envolée laisse sa légende ; un document envolé sans
        // légende ne laisserait RIEN — son nom est tout ce qu'on en savait.
        let mut sorties = std::collections::HashMap::new();
        sorties.insert(
            "bail".to_string(),
            Sortie { fichier: None, image: false, nom: "bail-signe-2026.pdf".to_string() },
        );
        let entries = vec![bloc("2026-09-09", "2026-09-09T09:00:00.000Z", "![](piece:bail)")];
        let md = markdown_du_journal(&entries, &sorties, "p");

        assert!(md.contains("bail-signe-2026.pdf"), "{md}");
        assert!(!md.contains("]("), "aucun lien ne doit pointer vers le vide — {md}");
    }

    #[test]
    fn l_export_rend_un_document_par_jour_et_des_liens_qui_pointent_quelque_part() {
        let mut noms = std::collections::HashMap::new();
        noms.insert("f9aa0944".to_string(), sortie("capture.png", true));

        let entries = vec![
            bloc("2026-09-07", "2026-09-07T09:15:00.000Z", "Une première journée."),
            bloc(
                "2026-09-08",
                "2026-09-08T09:29:00.000Z",
                "![La terrasse](piece:f9aa0944)\n\nIl a plu ensuite.",
            ),
            bloc("2026-09-08", "2026-09-08T16:02:00.000Z", "![](piece:f9aa0944)"),
            bloc(
                "2026-09-08",
                "2026-09-08T18:40:00.000Z",
                "![Le chat sur le muret.](piece:disparue)\n\nLa suite.",
            ),
        ];

        let md = markdown_du_journal(&entries, &noms, "journal-pieces");

        assert!(md.starts_with("# Journal\n\n"));
        assert!(md.contains("## lundi 7 septembre 2026"));
        // Un seul titre par jour, même à trois reprises.
        assert_eq!(md.matches("## mardi 8 septembre 2026").count(), 1);

        // Le renvoi privé devient un lien relatif vers le dossier voisin.
        assert!(md.contains("![La terrasse](journal-pieces/capture.png)"));

        // Une image SANS légende reste une image : c'est là que les règles de
        // ce code ont déjà cédé une fois (l'invitation « rien pour l'instant »
        // se dessinait par-dessus les photos, faute de texte à voir).
        assert!(md.contains("![](journal-pieces/capture.png)"));

        // Une pièce disparue laisse sa légende en texte, jamais un lien mort —
        // et surtout jamais le schéma privé.
        assert!(md.contains("Le chat sur le muret."), "{md}");
        assert!(!md.contains("piece:"), "{md}");
        assert!(!md.contains("disparue"), "{md}");
    }

    #[test]
    fn l_export_donne_l_heure_de_celui_qui_lit_pas_celle_du_serveur() {
        // `written_at` est en UTC ; la page a toujours affiché l'heure LOCALE.
        // Un export en UTC décalerait toute une journée d'écriture.
        let entries = vec![bloc(
            "2026-09-08",
            "2026-09-08T09:29:00.000Z",
            "Le texte.",
        )];
        let attendu = chrono::DateTime::parse_from_rfc3339("2026-09-08T09:29:00.000Z")
            .unwrap()
            .with_timezone(&chrono::Local)
            .format("%H:%M")
            .to_string();

        let md = markdown_du_journal(&entries, &std::collections::HashMap::new(), "p");
        assert!(md.contains(&format!("*{attendu}*")), "{md}");
    }

    #[test]
    fn un_bloc_vide_n_emporte_pas_son_heure_dans_l_export() {
        // Un bloc vidé sans être effacé ne mérite pas une ligne d'heure seule.
        let entries = vec![bloc("2026-09-08", "2026-09-08T09:29:00.000Z", "   \n\n  ")];
        assert_eq!(
            markdown_du_journal(&entries, &std::collections::HashMap::new(), "p"),
            "# Journal\n\n"
        );
    }

    #[test]
    fn les_identifiants_de_pieces_se_lisent_dans_le_texte() {
        assert_eq!(
            ids_pieces("![a](piece:un)\n\ntexte\n\n![](piece:deux)"),
            vec!["un".to_string(), "deux".to_string()]
        );
        assert!(ids_pieces("pas de pièce ici").is_empty());
        // Une syntaxe tronquée ne doit pas partir en boucle.
        assert!(ids_pieces("![a](piece:jamais-ferme").is_empty());
    }

    #[test]
    fn l_export_pose_vraiment_les_fichiers_a_cote_du_document() {
        // Le seul test qui touche le disque : le reste vérifie du texte, et du
        // texte juste n'a jamais prouvé qu'un fichier avait été écrit.
        let bac = std::env::temp_dir().join(format!("listik-export-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&bac).unwrap();
        let source = bac.join("source");
        std::fs::create_dir_all(&source).unwrap();

        // Deux photos DU MÊME NOM d'origine, plus une dont le fichier n'existe
        // pas — les trois cas qui font mentir un export.
        std::fs::write(source.join("a.png"), b"AAA").unwrap();
        std::fs::write(source.join("b.png"), b"BBB").unwrap();
        let fiche = |id: &str, nom: &str, chemin: std::path::PathBuf| JournalPiece {
            id: id.to_string(),
            kind: "image".to_string(),
            nom_origine: nom.to_string(),
            chemin: chemin.to_string_lossy().into_owned(),
            taille: Some(3),
            created_at: "2026-09-08T09:00:00.000Z".to_string(),
        };
        let fiches = vec![
            fiche("un", "capture.png", source.join("a.png")),
            fiche("deux", "capture.png", source.join("b.png")),
            fiche("trois", "envolee.png", source.join("jamais-ecrite.png")),
        ];

        let entries = vec![bloc(
            "2026-09-08",
            "2026-09-08T09:29:00.000Z",
            "![Une](piece:un)\n\n![Deux](piece:deux)\n\n![Trois](piece:trois)",
        )];

        let cible = bac.join("mon journal.md");
        let bilan = ecrire_export(&cible, &entries, &fiches).unwrap();

        assert_eq!(bilan.jours, 1);
        assert_eq!(bilan.pieces, 2, "la photo disparue ne doit pas être comptée");

        let dossier = bac.join("mon journal-pieces");
        assert_eq!(std::fs::read(dossier.join("capture.png")).unwrap(), b"AAA");
        assert_eq!(std::fs::read(dossier.join("capture-2.png")).unwrap(), b"BBB");

        let md = std::fs::read_to_string(&cible).unwrap();
        // Le dossier porte une ESPACE : sans chevrons, le lien ne s'ouvre nulle part.
        assert!(md.contains("![Une](<mon journal-pieces/capture.png>)"), "{md}");
        assert!(md.contains("![Deux](<mon journal-pieces/capture-2.png>)"), "{md}");
        // La disparue laisse sa légende, jamais un lien vers un fichier absent.
        assert!(md.contains("Trois"), "{md}");
        assert!(!md.contains("envolee"), "{md}");

        std::fs::remove_dir_all(&bac).ok();
    }

    #[test]
    fn deux_photos_du_meme_nom_ne_s_ecrasent_pas_a_l_export() {
        let mut pris = std::collections::HashSet::new();
        assert_eq!(nom_unique(&mut pris, "capture.png"), "capture.png");
        assert_eq!(nom_unique(&mut pris, "capture.png"), "capture-2.png");
        assert_eq!(nom_unique(&mut pris, "capture.png"), "capture-3.png");
        assert_eq!(nom_unique(&mut pris, "sans-extension"), "sans-extension");
    }

    #[tokio::test]
    async fn la_legende_d_une_photo_la_rend_retrouvable() {
        // La légende vit dans le markdown (`![légende](piece:<id>)`) et non
        // dans une colonne à part : c'est ce qui la fait entrer dans l'index
        // sans une ligne de code de plus. « La terrasse » doit ramener la
        // PHOTO, pas seulement le paragraphe d'à côté.
        let pool = memory_pool().await;
        append_journal_entry(
            &pool,
            "2026-09-08",
            "![La terrasse, juste avant qu'il pleuve.](piece:f9aa0944-8d1e-4c02-9b77-2e5a1d3c6f80)",
        )
        .await
        .unwrap();

        let hits = search_journal(&pool, "terrasse", 20).await.unwrap();
        assert_eq!(hits.len(), 1, "la légende n'est pas indexée");
        assert!(hits[0].extrait.contains(MARQUE_DEBUT));

        // L'extrait est du markdown BRUT : `snippet` travaille sur la colonne
        // telle quelle. Le renvoi `piece:<id>` en fait donc partie, et c'est
        // au front de l'effacer — voir `sansMarkdown` dans
        // `features/journal/extrait.ts`, appelé AVANT le découpage sur les
        // marques justement parce que la marque tombe au milieu de la syntaxe.
        assert!(
            hits[0].extrait.contains("piece:"),
            "l'extrait a changé de forme : vérifier features/journal/extrait.ts — {}",
            hits[0].extrait
        );
    }

    #[tokio::test]
    async fn l_index_suit_la_table_sans_qu_on_y_pense() {
        // Une écriture oubliée dans l'index serait un passage introuvable, et
        // rien ne le dirait. Les triggers doivent tenir les trois cas.
        let pool = memory_pool().await;
        let e = append_journal_entry(&pool, "2026-08-20", "Le premier texte.")
            .await
            .unwrap();
        assert_eq!(search_journal(&pool, "premier", 20).await.unwrap().len(), 1);

        // Modifié : l'ancien mot ne doit plus répondre, le nouveau oui.
        update_journal_entry(
            &pool,
            &e.id,
            UpdateJournalEntry { target_day: None, content: Some("Le second texte.".into()) },
        )
        .await
        .unwrap();
        assert!(search_journal(&pool, "premier", 20).await.unwrap().is_empty());
        assert_eq!(search_journal(&pool, "second", 20).await.unwrap().len(), 1);

        // Supprimé : plus rien.
        delete_journal_entry(&pool, &e.id).await.unwrap();
        assert!(search_journal(&pool, "second", 20).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn search_journal_rend_le_plus_recent_en_premier() {
        // Dans un journal on cherche « quand ai-je parlé de ça » : la réponse
        // la plus utile est la plus récente, pas la plus dense en mots.
        let pool = memory_pool().await;
        for jour in ["2026-08-18", "2026-08-19", "2026-08-20"] {
            append_journal_entry(&pool, jour, "Le garage, encore.").await.unwrap();
        }
        let hits = search_journal(&pool, "garage", 20).await.unwrap();
        assert_eq!(
            hits.iter().map(|h| h.target_day.as_str()).collect::<Vec<_>>(),
            ["2026-08-20", "2026-08-19", "2026-08-18"]
        );

        // La limite est respectée.
        assert_eq!(search_journal(&pool, "garage", 2).await.unwrap().len(), 2);
    }

    #[test]
    fn nature_ne_devine_pas() {
        // Liste EXPLICITE : un fichier accepté puis muet à l'écran serait pire
        // qu'un fichier refusé.
        for nom in ["photo.png", "PHOTO.JPG", "vue.jpeg", "anim.gif", "x.webp", "y.avif"] {
            assert_eq!(nature(nom), Some("image"), "{nom} aurait dû être une image");
        }
        // Le PDF a sa propre nature : c'est le seul document qui s'aperçoit.
        for nom in ["bail.pdf", "BAIL.PDF"] {
            assert_eq!(nature(nom), Some("pdf"), "{nom} aurait dû être un pdf");
        }
        for nom in ["lettre.docx", "budget.xlsx", "liste.csv", "notes.md", "expose.odp"] {
            assert_eq!(nature(nom), Some("document"), "{nom} aurait dû être un document");
        }
        // Une archive n'est pas ce qu'on pose dans un journal, et la pièce est
        // COPIÉE : accepter un `.zip` inviterait à y déposer quatre gigaoctets.
        for nom in ["archive.zip", "voix.m4a", "film.mp4", "sans-extension", ""] {
            assert_eq!(nature(nom), None, "{nom} n'aurait pas dû passer");
        }
    }

    #[tokio::test]
    async fn une_piece_atterrit_sur_le_disque_et_en_base() {
        let pool = memory_pool().await;
        let dossier = std::env::temp_dir().join(format!("listik-pieces-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dossier).unwrap();

        let octets = b"\x89PNG\r\n\x1a\nfaux mais suffisant";
        let piece = create_journal_piece(&pool, &dossier, "IMG_4821.png", octets)
            .await
            .unwrap();

        assert_eq!(piece.kind, "image");
        // Le nom d'ORIGINE est gardé — c'est lui qu'on reconnaît.
        assert_eq!(piece.nom_origine, "IMG_4821.png");
        // Le nom sur le DISQUE est un uuid : deux « IMG_4821.png » ne doivent
        // pas se recouvrir.
        assert!(piece.chemin.ends_with(".png"));
        assert!(!piece.chemin.contains("IMG_4821"));
        assert_eq!(std::fs::read(&piece.chemin).unwrap(), octets);

        // Deux fois le même nom : deux fichiers distincts, tous deux intacts.
        let deux = create_journal_piece(&pool, &dossier, "IMG_4821.png", b"autre")
            .await
            .unwrap();
        assert_ne!(deux.chemin, piece.chemin);
        assert_eq!(std::fs::read(&piece.chemin).unwrap(), octets);

        // On les retrouve par leurs identifiants, et un inconnu est simplement
        // ABSENT — une pièce effacée hors de l'app ne casse pas la journée.
        let vues = list_journal_pieces(
            &pool,
            &dossier,
            &[piece.id.clone(), "fantome".into(), deux.id.clone()],
        )
        .await
        .unwrap();
        assert_eq!(vues.len(), 2);

        assert!(list_journal_pieces(&pool, &dossier, &[]).await.unwrap().is_empty());

        // Un document, lui, est accepté — et sa taille est celle des octets.
        let doc = create_journal_piece(&pool, &dossier, "bail.pdf", b"%PDF-1.7")
            .await
            .unwrap();
        assert_eq!(doc.kind, "pdf");
        assert_eq!(doc.taille, Some(8));

        // Ce que Listik ne sait pas ranger est refusé, et rien n'est écrit.
        let avant = std::fs::read_dir(&dossier).unwrap().count();
        assert!(create_journal_piece(&pool, &dossier, "archive.zip", b"PK\x03\x04")
            .await
            .is_err());
        assert_eq!(std::fs::read_dir(&dossier).unwrap().count(), avant);

        std::fs::remove_dir_all(&dossier).ok();
    }
}
