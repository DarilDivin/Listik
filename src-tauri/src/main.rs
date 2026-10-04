#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli_agent;
mod commands;
mod db;
mod models;
mod permissions;
mod reminders;

use std::sync::Arc;

use commands::{show_main_window, toggle_quick_window};
use db::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Le raccourci de capture rapide, tel que l'affiche le menu du tray.
const QUICK_ACCELERATOR: &str = if cfg!(target_os = "macos") { "Alt+Space" } else { "Alt+Q" };

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Le plugin compare la version installée au manifeste signé de la release.
        // Il ne lance aucune vérification par lui-même : le frontend choisit le
        // moment où l'utilisateur est averti puis demande l'installation.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Fermer la fenêtre principale la masque : l'app continue dans le tray
        // (ou la barre des menus) et `show_main_window` peut la rouvrir. La
        // détruire laissait le tray et Alt+Q sans fenêtre à montrer.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // --- Base de données (accès SQL côté Rust) ---
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(db::init_pool(&handle))
                .map_err(std::io::Error::other)?;

            // Migre les anciennes « listes » (texte libre) vers de vrais projets.
            // Idempotent → rejoué à chaque démarrage : rattrape les tâches créées
            // entre-temps par une version antérieure du binaire. Deux requêtes sur
            // un SQLite local, avant l'affichage : coût négligeable. Un échec ici
            // ne doit pas empêcher l'app de démarrer (les listes restent lisibles).
            match tauri::async_runtime::block_on(db::reconcile_lists_into_projects(&pool)) {
                Ok(0) => {}
                Ok(n) => println!("📁 {n} projet(s) créé(s) depuis les anciennes listes"),
                Err(e) => eprintln!("⚠️ Réconciliation listes → projets échouée: {e}"),
            }

            // --- Serveur MCP in-process (Phase R) ---
            // Claude Code (et autres clients) s'y connecte par HTTP sur le
            // loopback. R4 : de vrais outils (todos/notes/journal) sur le pool
            // partagé, qui émettent les mêmes événements que les commandes.
            let executor: Arc<dyn cli_agent::ToolExecutor> = Arc::new(cli_agent::DbExecutor::new(
                pool.clone(),
                Some(app.handle().clone()),
            ));
            let mcp_server = match cli_agent::spawn_mcp_server(executor) {
                Ok(server) => {
                    println!("🛰️  Serveur MCP Listik démarré sur le port {}", server.port);
                    Some(server)
                }
                Err(e) => {
                    eprintln!("⚠️ Impossible de démarrer le serveur MCP : {e}");
                    None
                }
            };

            app.manage(AppState { pool: pool.clone(), mcp_server });

            // --- Permissions de la webview ---
            // Le micro, pour les notes vocales du journal. Sans gestionnaire,
            // WebView2 laisse `getUserMedia` suspendu indefiniment.
            if let Some(principale) = app.get_webview_window("main") {
                if let Err(e) = permissions::autoriser_le_micro(&principale) {
                    eprintln!("⚠️ Permissions micro : {e}");
                }
            }

            // --- PATH de l'utilisateur (macOS) : demandé tout de suite, à part,
            // pour que le premier tour d'assistant n'attende pas le shell.
            std::thread::spawn(|| {
                let _ = cli_agent::user_path();
            });

            // --- Planificateur de rappels (notifications en arrière-plan) ---
            reminders::spawn_scheduler(app.handle().clone());

            // --- Menu du tray ---
            // Menu natif du tray : en-tête + groupes séparés (le style est géré
            // par l'OS ; on soigne la structure, les libellés et le raccourci).
            let header = MenuItem::with_id(app, "header", "Listik", false, None::<&str>)?;
            let quick_task =
                MenuItem::with_id(app, "quick_task", "Tâche rapide", true, Some(QUICK_ACCELERATOR))?;
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

            // Sur Mac, la barre des menus attend une icône « modèle » : une
            // silhouette noire que le système teinte selon le thème. Ailleurs,
            // l'icône de l'app en couleurs.
            let template = cfg!(target_os = "macos");
            let icon = if template {
                tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?
            } else {
                app.default_window_icon()
                    .cloned()
                    .ok_or_else(|| std::io::Error::other("icône de fenêtre par défaut manquante"))?
            };

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Listik - Gestionnaire de tâches")
                .icon(icon)
                .icon_as_template(template)
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

            // --- Raccourci global de capture rapide ---
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                // Alt+Espace est réservé par Windows (menu système) → Alt+Q.
                // Sur Mac, ⌥Q taperait « œ » et dépend de la disposition du
                // clavier (en AZERTY, c'est la touche A) : ⌥Espace, la même
                // touche partout, comme les lanceurs du Mac.
                let toggle_shortcut = if cfg!(target_os = "macos") {
                    Shortcut::new(Some(Modifiers::ALT), Code::Space)
                } else {
                    Shortcut::new(Some(Modifiers::ALT), Code::KeyQ)
                };
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
                    eprintln!("⚠️ Impossible d'enregistrer {QUICK_ACCELERATOR} (déjà utilisé ?) : {e}");
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
            commands::list_journal_entries_for_day,
            commands::count_journal_entries_by_month,
            commands::list_upcoming_journal_entries,
            commands::create_journal_entry,
            commands::append_journal_entry,
            commands::search_journal,
            commands::attach_journal_piece,
            commands::attach_journal_piece_bytes,
            commands::attach_journal_voice,
            commands::list_journal_pieces,
            commands::set_journal_piece_apercu,
            commands::export_journal,
            commands::update_journal_entry,
            commands::delete_journal_entry,
            commands::set_journal_entry_tags,
            commands::toggle_quick_window,
            commands::hide_quick_window,
            commands::show_main_window,
            commands::get_settings,
            commands::update_settings,
            commands::ai_parse,
            commands::ai_agent_run,
            commands::inspect_ai_providers,
            commands::connect_ai_provider,
            commands::test_ai_provider,
            commands::export_backup,
            commands::restore_backup,
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
            commands::set_todo_tags,
            commands::get_orderings,
            commands::set_ordering,
            commands::duplicate_todo,
            commands::duplicate_project,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Pas de process Python à tuer : l'IA est soit en Rust (R2-R4), soit
            // lancée à la demande par cli_agent (tuée explicitement par le code).
            //
            // Sur Mac, un clic sur l'icône du Dock rouvre la fenêtre masquée.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            let _ = (app_handle, event);
        });
}
