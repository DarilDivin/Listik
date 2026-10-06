//! L'icône de Listik dans la zone de notification (la barre des menus sur Mac).
//!
//! Clic droit : un menu natif court, fait pour agir vite. Sur Mac, la barre
//! des menus l'ouvre au clic, comme toutes les apps de cette barre. Sous
//! Windows, le clic gauche ouvre la fenêtre principale.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App,
};

use crate::commands::{open_quick_in_mode, reveal_main_window};

/// Le raccourci de capture rapide, tel que l'affiche le menu.
pub const QUICK_ACCELERATOR: &str = if cfg!(target_os = "macos") { "Alt+Space" } else { "Alt+Q" };

pub fn build(app: &App) -> tauri::Result<()> {
    let quick = MenuItem::with_id(app, "quick", "Capture rapide", true, Some(QUICK_ACCELERATOR))?;
    let task = MenuItem::with_id(app, "task", "Nouvelle tâche", true, None::<&str>)?;
    let journal = MenuItem::with_id(app, "journal", "Entrée de journal", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Ouvrir Listik", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter Listik", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &quick,
            &task,
            &journal,
            &PredefinedMenuItem::separator(app)?,
            &open,
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

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Listik")
        .icon(icon)
        .icon_as_template(template)
        .menu(&menu)
        // Sous Windows, le menu s'ouvrait AUSSI au clic gauche, par-dessus la
        // fenêtre que ce clic faisait apparaître. Il reste au clic droit.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "quick" => open_quick_in_mode(app, None),
                "task" => open_quick_in_mode(app, Some("tache")),
                "journal" => open_quick_in_mode(app, Some("journal")),
                "open" => reveal_main_window(app),
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(e) = result {
                eprintln!("⚠️ Menu du tray ({}) : {e}", event.id.as_ref());
            }
        })
        .on_tray_icon_event(|tray, event| {
            // `Click` arrive deux fois, à l'appui puis au relâchement : on ne
            // garde que le relâchement, comme un bouton.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if cfg!(target_os = "macos") {
                    return;
                }
                if let Err(e) = reveal_main_window(tray.app_handle()) {
                    eprintln!("⚠️ Clic sur le tray : {e}");
                }
            }
        })
        .build(app)?;

    Ok(())
}
