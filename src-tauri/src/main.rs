#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod models;
mod reminders;
mod sidecar;
mod vectorizer;

use commands::{show_main_window, toggle_quick_window};
use db::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // --- Base de données (accès SQL côté Rust) ---
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(db::init_pool(&handle))
                .map_err(std::io::Error::other)?;
            app.manage(AppState { pool });

            // --- Planificateur de rappels (notifications en arrière-plan) ---
            reminders::spawn_scheduler(app.handle().clone());

            // --- Sidecar Python (IA) ---
            app.manage(sidecar::SidecarState::empty());
            sidecar::spawn(app.handle().clone());

            // --- Pipeline d'indexation asynchrone (tâches/notes → sidecar) ---
            vectorizer::spawn_indexer(app.handle().clone());

            // --- Menu du tray ---
            // Menu natif du tray : en-tête + groupes séparés (le style est géré
            // par l'OS ; on soigne la structure, les libellés et le raccourci).
            let header = MenuItem::with_id(app, "header", "Listik", false, None::<&str>)?;
            let quick_task =
                MenuItem::with_id(app, "quick_task", "Tâche rapide", true, Some("Alt+Q"))?;
            let open_app =
                MenuItem::with_id(app, "main", "Ouvrir Listik", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter Listik", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &header,
                    &PredefinedMenuItem::separator(app)?,
                    &quick_task,
                    &open_app,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| std::io::Error::other("icône de fenêtre par défaut manquante"))?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Listik - Gestionnaire de tâches")
                .icon(icon)
                .menu(&menu)
                .on_menu_event(move |app_handle, event| match event.id.as_ref() {
                    "quick_task" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = toggle_quick_window(app_handle).await {
                                eprintln!("Erreur capture rapide: {e}");
                            }
                        });
                    }
                    "main" => {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = show_main_window(app_handle).await {
                                eprintln!("Erreur main: {e}");
                            }
                        });
                    }
                    "quit" => {
                        app_handle.exit(0);
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
                            if let Err(e) = show_main_window(app_handle).await {
                                eprintln!("Erreur tray click: {e}");
                            }
                        });
                    }
                })
                .build(app)?;

            println!("🚀 Application Listik démarrée !");

            // --- Raccourci global Alt+Space ---
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                // Alt+Space est réservé par Windows (menu système) → Alt+Q.
                let toggle_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);
                let shortcut_handle = app.handle().clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, event| {
                            if shortcut == &toggle_shortcut
                                && event.state() == ShortcutState::Pressed
                            {
                                let app_handle = shortcut_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = toggle_quick_window(app_handle).await {
                                        eprintln!("❌ Erreur toggle capture rapide via raccourci: {e}");
                                    }
                                });
                            }
                        })
                        .build(),
                )?;

                // Ne pas planter si le raccourci est déjà pris par un autre programme.
                if let Err(e) = app.global_shortcut().register(toggle_shortcut) {
                    eprintln!("⚠️ Impossible d'enregistrer Alt+Q (déjà utilisé ?) : {e}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_todos,
            commands::list_todos_by_date,
            commands::create_todo,
            commands::update_todo,
            commands::toggle_todo,
            commands::delete_todo,
            commands::list_notes,
            commands::search_notes,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::toggle_quick_window,
            commands::hide_quick_window,
            commands::show_main_window,
            commands::get_settings,
            commands::update_settings,
            commands::ai_ping,
            commands::ai_parse,
            commands::ai_agent,
            commands::ai_search,
            commands::export_backup,
            commands::create_subtask,
            commands::update_subtask,
            commands::delete_subtask,
            commands::list_areas,
            commands::create_area,
            commands::update_area,
            commands::delete_area,
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::list_tags,
            commands::create_tag,
            commands::update_tag,
            commands::delete_tag,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                sidecar::kill(app_handle);
            }
        });
}
