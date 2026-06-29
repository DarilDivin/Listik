use crate::models::{CreateTodo, Recurrence, Settings, Todo, TodoStatus, UpdateSettings, UpdateTodo};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// État partagé exposé aux commandes Tauri.
pub struct AppState {
    pub pool: SqlitePool,
}

const SELECT_COLUMNS: &str =
    "id, text, note, list, status, priority, recurrence, scheduled_for, due_date, remind_at, created_at, updated_at";

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

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Todo>, sqlx::Error> {
    let query = format!("SELECT {SELECT_COLUMNS} FROM todos ORDER BY created_at DESC");
    sqlx::query_as::<_, Todo>(&query).fetch_all(pool).await
}

pub async fn list_by_date(pool: &SqlitePool, date: &str) -> Result<Vec<Todo>, sqlx::Error> {
    let query =
        format!("SELECT {SELECT_COLUMNS} FROM todos WHERE scheduled_for = ? ORDER BY created_at DESC");
    sqlx::query_as::<_, Todo>(&query)
        .bind(date)
        .fetch_all(pool)
        .await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Todo>, sqlx::Error> {
    let query = format!("SELECT {SELECT_COLUMNS} FROM todos WHERE id = ?");
    sqlx::query_as::<_, Todo>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await
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
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO todos (id, text, note, list, status, priority, recurrence, scheduled_for, due_date, remind_at, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    sep.push("updated_at = ").push_bind_unseparated(now);

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
                "UPDATE todos SET scheduled_for = ?, due_date = ?, remind_at = ?, reminded = 0, updated_at = ? WHERE id = ?",
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
    sqlx::query("UPDATE todos SET status = ?, updated_at = ? WHERE id = ?")
        .bind(new_status)
        .bind(now_iso())
        .bind(id)
        .execute(pool)
        .await?;

    get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM todos WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        create, delete, due_reminders, get_settings, list_all, list_by_date, mark_reminded,
        take_due_digest, toggle, update, update_settings,
    };
    use crate::models::{CreateTodo, TodoStatus, UpdateSettings, UpdateTodo};
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
}
