#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;

use models::{CreateTodo, Todo};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

// use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// Commande pour créer un nouveau todo
#[tauri::command]
async fn create_todo(todo_data: CreateTodo) -> Result<Todo, String> {
    let mut todo = Todo::new(todo_data.text);

    if let Some(priority) = todo_data.priority {
        todo.priority = priority;
    }
    if let Some(due_date) = todo_data.due_date {
        todo.due_date = Some(due_date);
    }
    if let Some(scheduled_for) = todo_data.scheduled_for {
        todo.scheduled_for = Some(scheduled_for);
    }

    println!("Nouveau todo créé: {:?}", todo);
    Ok(todo)
}

#[tauri::command]
async fn get_today_todos() -> Result<Vec<Todo>, String> {
    let mut example_todo = Todo::new("Exemple de todo pour aujourd'hui".to_string());
    example_todo.scheduled_for = Some(chrono::Utc::now().date_naive());
    Ok(vec![example_todo])
}

#[tauri::command]
async fn toggle_todo(todo_id: String) -> Result<Todo, String> {
    println!("Toggle todo avec ID: {}", todo_id);
    let mut todo = Todo::new("Todo exemple".to_string());
    todo.id = todo_id;
    todo.complete();
    Ok(todo)
}

#[tauri::command]
async fn open_planner_window(app: AppHandle) -> Result<(), String> {
    let planner_window = app.get_webview_window("planner");

    match planner_window {
        Some(window) => {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        None => {
            let _window =
                WebviewWindowBuilder::new(&app, "planner", WebviewUrl::App("/planner".into()))
                    .title("Planificateur Listik")
                    .inner_size(1200.0, 800.0)
                    .center()
                    .decorations(false)
                    .resizable(true)
                    .build()
                    .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn toggle_daily_window(app: AppHandle) -> Result<(), String> {
    println!("🔍 Toggle daily window...");
    
    if let Some(window) = app.get_webview_window("daily") {
        println!("✅ Fenêtre daily existe → fermeture");
        // Fermer complètement au lieu de cacher
        window.close().map_err(|e| e.to_string())?;
    } else {
        println!("🆕 Création d'une nouvelle fenêtre daily");
        let window = WebviewWindowBuilder::new(&app, "daily", WebviewUrl::App("/daily".into()))
            .title("Tâches du jour")
            .inner_size(420.0, 650.0)
            .center()
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .build()
            .map_err(|e| e.to_string())?;

        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        println!("✅ Fenêtre daily créée");
    }

    Ok(())
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    let main_window = app.get_webview_window("main");

    match main_window {
        Some(window) => {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        None => return Err("Fenêtre principale introuvable".to_string()),
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        // .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Créer le menu du tray
            let quick_task =
                MenuItem::with_id(app, "quick_task", "➕ Tâche rapide", true, None::<&str>)?;
            let daily = MenuItem::with_id(app, "daily", "📅 Vue quotidienne", true, None::<&str>)?;
            let planner =
                MenuItem::with_id(app, "planner", "📋 Planificateur", true, None::<&str>)?;
            let main_window =
                MenuItem::with_id(app, "main", "🏠 Fenêtre principale", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "❌ Quitter", true, None::<&str>)?;

            let menu =
                Menu::with_items(app, &[&quick_task, &daily, &planner, &main_window, &quit])?;

            // Créer l'icône du tray
            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Listik - Gestionnaire de tâches")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app_handle, event| match event.id.as_ref() {
                    "quick_task" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_daily_window(app_handle).await {
                                eprintln!("Erreur quick_task: {}", e);
                            }
                        });
                    }
                    "daily" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_daily_window(app_handle).await {
                                eprintln!("Erreur daily: {}", e);
                            }
                        });
                    }
                    "planner" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = open_planner_window(app_handle).await {
                                eprintln!("Erreur planner: {}", e);
                            }
                        });
                    }
                    "main" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = show_main_window(app_handle).await {
                                eprintln!("Erreur main: {}", e);
                            }
                        });
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app_handle = tray.app_handle().clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_daily_window(app_handle).await {
                                eprintln!("Erreur tray click: {}", e);
                            }
                        });
                    }
                })
                .build(app)?;

            println!("🚀 Application Listik démarrée !");
            println!("   💡 Raccourcis globaux gérés côté frontend");
            println!("   🖱️ Icône tray : clic gauche = vue quotidienne");

            // Ok(())

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

                let ctrl_i_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyI);
                let app_handle_clone = app.handle().clone(); // ← Ajouter cette ligne
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new().with_handler(move |_app, shortcut, event| {
                        println!("{:?}", shortcut);
                        if shortcut == &ctrl_i_shortcut {
                            match event.state() {
                              ShortcutState::Pressed => {
                                println!("🎯 Ctrl-I Pressed! Toggling daily window...");
                        
                                // Utiliser toggle_daily_window
                                let app_handle = app_handle_clone.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = toggle_daily_window(app_handle).await {
                                        eprintln!("❌ Erreur toggle daily via raccourci: {}", e);
                                    } else {
                                        println!("✅ Daily window toggled via Ctrl+I");
                                    }
                                });
                              }
                              ShortcutState::Released => {
                                println!("Ctrl-I Released!");
                              }
                            }
                        }
                    })
                    .build(),
                )?;

                app.global_shortcut().register(ctrl_i_shortcut)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_todo,
            get_today_todos,
            toggle_todo,
            open_planner_window,
            toggle_daily_window,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
