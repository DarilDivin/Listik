//! L'icône de Listik dans la zone de notification (la barre des menus sur Mac).
//!
//! Sous Windows, le clic gauche ouvre un petit panneau Listik posé au-dessus
//! de l'icône, comme les panneaux du système (son, réseau) : les tâches du
//! jour à cocher, la capture rapide dans ses trois modes, l'app. Le clic droit
//! garde un menu natif court, fait pour agir vite.
//!
//! Sur Mac, la barre des menus ouvre le menu natif au clic, comme toutes les
//! apps de cette barre ; le panneau n'y est pas créé.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, LogicalSize, Manager, PhysicalPosition, Rect, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::commands::{open_quick_in_mode, reveal_main_window};

/// Le raccourci de capture rapide, tel que l'affiche le menu.
pub const QUICK_ACCELERATOR: &str = if cfg!(target_os = "macos") { "Alt+Space" } else { "Alt+Q" };

/// Libellé de la fenêtre du panneau (route `/tray`).
pub const PANEL: &str = "tray";
/// Largeur du panneau, en pixels logiques. La hauteur suit le contenu.
const PANEL_WIDTH: f64 = 320.0;
/// Écart entre le panneau et le bord de la zone utile, comme les panneaux
/// du système sous Windows 11.
const PANEL_MARGIN: f64 = 12.0;
/// Un clic sur l'icône pendant que le panneau est ouvert le ferme d'abord par
/// perte du focus, puis arrive au gestionnaire du clic : sans ce délai, le
/// clic le rouvrirait aussitôt.
const REOPEN_GUARD: Duration = Duration::from_millis(300);

/// Ce dont le panneau se souvient entre deux affichages.
#[derive(Default)]
struct PanelState {
    /// Rectangle de l'icône (pixels physiques), pour se replacer quand la
    /// hauteur change.
    anchor: Mutex<Option<Rect>>,
    /// Quand la perte du focus l'a fermé pour la dernière fois.
    hidden_at: Mutex<Option<Instant>>,
}

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
    let mac = cfg!(target_os = "macos");
    let icon = if mac {
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?
    } else {
        app.default_window_icon()
            .cloned()
            .ok_or_else(|| std::io::Error::other("icône de fenêtre par défaut manquante"))?
    };

    if !mac {
        create_panel(app)?;
    }

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Listik")
        .icon(icon)
        .icon_as_template(mac)
        .menu(&menu)
        // Le clic gauche appartient au panneau ; le menu reste au clic droit.
        .show_menu_on_left_click(mac)
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
                rect,
                ..
            } = event
            {
                if cfg!(target_os = "macos") {
                    return;
                }
                if let Err(e) = toggle_panel(tray.app_handle(), Some(rect)) {
                    eprintln!("⚠️ Panneau du tray : {e}");
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Crée le panneau caché dès le démarrage : au premier clic, la page est déjà
/// chargée et le panneau apparaît sans attendre.
fn create_panel(app: &App) -> tauri::Result<()> {
    app.manage(PanelState::default());
    WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("/tray".into()))
        .title("Listik")
        .inner_size(PANEL_WIDTH, 360.0)
        .visible(false)
        .focused(false)
        .decorations(false)
        // Fenêtre opaque avec l'ombre du système : sous Windows 11, elle
        // reçoit les coins arrondis et l'ombre des panneaux natifs.
        .shadow(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()?;
    Ok(())
}

/// Ouvre le panneau au-dessus de l'icône, ou le ferme s'il est ouvert. Sans
/// rectangle d'icône, il se pose près du pointeur.
pub fn toggle_panel(app: &AppHandle, anchor: Option<Rect>) -> Result<(), String> {
    let window = panel(app)?;
    let state = app.state::<PanelState>();

    if window.is_visible().map_err(|e| e.to_string())? {
        return window.hide().map_err(|e| e.to_string());
    }
    let just_hidden = state
        .hidden_at
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < REOPEN_GUARD);
    if just_hidden {
        return Ok(());
    }

    let anchor = match anchor {
        Some(rect) => rect,
        None => {
            let cursor = app.cursor_position().map_err(|e| e.to_string())?;
            Rect {
                position: cursor.into(),
                size: tauri::PhysicalSize::new(1u32, 1u32).into(),
            }
        }
    };
    *state.anchor.lock().unwrap() = Some(anchor);

    place(app, &window, anchor)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// Ferme le panneau quand il perd le focus (clic ailleurs, autre fenêtre).
pub fn on_panel_blur(window: &tauri::Window) {
    let app = window.app_handle();
    if let Some(state) = app.try_state::<PanelState>() {
        *state.hidden_at.lock().unwrap() = Some(Instant::now());
    }
    let _ = window.hide();
}

/// Le panneau mesure son contenu et ajuste sa hauteur ; il se replace pour
/// rester collé à l'icône.
pub fn resize_panel(app: &AppHandle, height: f64) -> Result<(), String> {
    let window = panel(app)?;
    window
        .set_size(LogicalSize::new(PANEL_WIDTH, height.clamp(120.0, 640.0)))
        .map_err(|e| e.to_string())?;
    let anchor = *app.state::<PanelState>().anchor.lock().unwrap();
    match anchor {
        Some(anchor) => place(app, &window, anchor),
        None => Ok(()),
    }
}

fn panel(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(PANEL)
        .ok_or_else(|| "Panneau du tray introuvable".to_string())
}

/// Pose le panneau contre l'icône, du côté de la barre des tâches (qui peut
/// être sur n'importe quel bord), sans jamais sortir de la zone utile.
fn place(app: &AppHandle, window: &WebviewWindow, anchor: Rect) -> Result<(), String> {
    // Les coordonnées de l'icône sont physiques sous Windows ; l'écran qui la
    // porte donne l'échelle pour le cas où elles ne le seraient pas.
    let probe = anchor.position.to_physical::<f64>(1.0);
    let monitor = app
        .monitor_from_point(probe.x, probe.y)
        .map_err(|e| e.to_string())?
        .or(window.current_monitor().map_err(|e| e.to_string())?)
        .ok_or_else(|| "Aucun écran pour le panneau".to_string())?;
    let scale = monitor.scale_factor();

    let icon = anchor.position.to_physical::<f64>(scale);
    let icon_size = anchor.size.to_physical::<f64>(scale);
    let (cx, cy) = (icon.x + icon_size.width / 2.0, icon.y + icon_size.height / 2.0);

    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (w, h) = (size.width as f64, size.height as f64);

    let work = monitor.work_area();
    let left = work.position.x as f64;
    let top = work.position.y as f64;
    let right = left + work.size.width as f64;
    let bottom = top + work.size.height as f64;
    let margin = PANEL_MARGIN * scale;

    let (x, y) = if cy >= bottom {
        (cx - w / 2.0, bottom - h - margin) // barre des tâches en bas
    } else if cy < top {
        (cx - w / 2.0, top + margin) // en haut
    } else if cx < left {
        (left + margin, cy - h / 2.0) // à gauche
    } else if cx >= right {
        (right - w - margin, cy - h / 2.0) // à droite
    } else {
        // Icône dans la zone utile : panneau des icônes cachées, barre
        // masquée automatiquement. On se pose au-dessus.
        (cx - w / 2.0, cy - h - margin)
    };

    let x = x.clamp(left + margin, (right - w - margin).max(left + margin));
    let y = y.clamp(top + margin, (bottom - h - margin).max(top + margin));
    window
        .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .map_err(|e| e.to_string())
}
