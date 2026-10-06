#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli_agent;
mod commands;
mod db;
mod models;
mod navigation;
mod permissions;
mod reminders;
mod tray;

use std::sync::Arc;

use commands::toggle_quick_window;
use db::AppState;
use tauri::Manager;
use tray::QUICK_ACCELERATOR;

fn main() {
    let mut context = tauri::generate_context!();
    // Le dev a ses propres données (base, pièces, profil du webview) : sinon
    // l'app installée sur le même poste ouvre la base de dev, et les essais
    // touchent les vraies tâches. Les chemins dérivent tous de l'identifiant.
    if cfg!(debug_assertions) {
        context.config_mut().identifier.push_str(".dev");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Aucune fenêtre ne quitte l'app : un lien externe part dans le navigateur.
        .plugin(navigation::garde())
        // Le plugin compare la version installée au manifeste signé de la release.
        // Il ne lance aucune vérification par lui-même : le frontend choisit le
        // moment où l'utilisateur est averti puis demande l'installation.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Fermer la fenêtre principale la masque : l'app continue dans le tray
        // (ou la barre des menus) et `show_main_window` peut la rouvrir. La
        // détruire laissait le tray et Alt+Q sans fenêtre à montrer.
        //
        // Le panneau du tray se masque aussi (Alt+F4 le détruirait), et se
        // ferme dès qu'il perd le focus, comme un panneau du système.
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. }
                if window.label() == "main" || window.label() == tray::PANEL =>
            {
                api.prevent_close();
                let _ = window.hide();
            }
            tauri::WindowEvent::Focused(false) if window.label() == tray::PANEL => {
                tray::on_panel_blur(window);
            }
            _ => {}
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

            // --- Icône du tray ---
            tray::build(app)?;

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
            commands::open_quick_window,
            commands::toggle_tray_panel,
            commands::resize_tray_panel,
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
        .build(context)
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
