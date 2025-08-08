// Types correspondant aux structures Rust

export enum TodoStatus {
  Pending = "Pending",
  Completed = "Completed"
}

export enum Priority {
  Low = "Low",
  Normal = "Normal", 
  High = "High"
}

export interface Todo {
  id: string;
  text: string;
  status: TodoStatus;
  priority: Priority;
  due_date?: string; // Format ISO date (YYYY-MM-DD)
  scheduled_for?: string; // Format ISO date (YYYY-MM-DD)
  created_at: string; // Format ISO datetime
  completed_at?: string; // Format ISO datetime
}

export interface CreateTodo {
  text: string;
  priority?: Priority;
  due_date?: string;
  scheduled_for?: string;
}

export interface UpdateTodo {
  text?: string;
  priority?: Priority;
  due_date?: string;
  scheduled_for?: string;
  status?: TodoStatus;
}