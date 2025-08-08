use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

// Énumération pour le statut d'un todo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TodoStatus {
    Pending,   // En attente
    Completed, // Terminé
}

// Énumération pour la priorité (optionnel et simple)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Priority {
    Low,    // Basse
    Normal, // Normale
    High,   // Haute
}

// Structure principale pour un todo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: String,                          // Identifiant unique
    pub text: String,                        // Texte du todo
    pub status: TodoStatus,                  // Statut (fait/pas fait)
    pub priority: Priority,                  // Priorité
    pub due_date: Option<NaiveDate>,         // Date d'échéance (optionnel)
    pub scheduled_for: Option<NaiveDate>,    // Planifié pour (optionnel)
    pub created_at: DateTime<Utc>,           // Date de création
    pub completed_at: Option<DateTime<Utc>>, // Date de completion
}

// Implémentation de méthodes pour Todo
impl Todo {
    // Créer un nouveau todo
    pub fn new(text: String) -> Self {
        Todo {
            id: uuid::Uuid::new_v4().to_string(),
            text,
            status: TodoStatus::Pending,
            priority: Priority::Normal,
            due_date: None,
            scheduled_for: None,
            created_at: Utc::now(),
            completed_at: None,
        }
    }

    // Marquer comme terminé
    pub fn complete(&mut self) {
        self.status = TodoStatus::Completed;
        self.completed_at = Some(Utc::now());
    }

    // Remettre en pending
    pub fn uncomplete(&mut self) {
        self.status = TodoStatus::Pending;
        self.completed_at = None;
    }

    // Vérifier si c'est pour aujourd'hui
    pub fn is_for_today(&self) -> bool {
        if let Some(scheduled_date) = self.scheduled_for {
            let today = chrono::Utc::now().date_naive();
            scheduled_date == today
        } else {
            false
        }
    }

    // Vérifier si c'est en retard
    pub fn is_overdue(&self) -> bool {
        if let Some(due_date) = self.due_date {
            let today = chrono::Utc::now().date_naive();
            due_date < today && matches!(self.status, TodoStatus::Pending)
        } else {
            false
        }
    }
}

// Structure simple pour créer un nouveau todo
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTodo {
    pub text: String,
    pub priority: Option<Priority>,
    pub due_date: Option<NaiveDate>,
    pub scheduled_for: Option<NaiveDate>,
}

// Structure pour mettre à jour un todo
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTodo {
    pub text: Option<String>,
    pub priority: Option<Priority>,
    pub due_date: Option<NaiveDate>,
    pub scheduled_for: Option<NaiveDate>,
    pub status: Option<TodoStatus>,
}
