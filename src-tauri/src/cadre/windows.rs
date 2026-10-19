//! Le cadre natif sous Windows.
//!
//! Ce que fait le système, et que la page ne peut pas faire : les coins
//! arrondis et le liseré de Windows 11, l'ombre (tao la donne aux fenêtres
//! sans décorations qui ont `shadow: true`), et la fenêtre qui se transforme
//! elle-même.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewWindow};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmFlush, DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::Graphics::Gdi::{
    CreateSolidBrush, DeleteObject, FillRect, RedrawWindow, HDC, RDW_ERASE, RDW_ERASENOW,
    RDW_INVALIDATE, RDW_NOCHILDREN,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE,
    STYLESTRUCT, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WM_ERASEBKGND, WM_SIZE, WM_STYLECHANGING, WS_CLIPCHILDREN, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

use super::courbe::METAMORPHOSE;
use super::Cadre;

/// La couleur du fond (COLORREF, 0x00BBGGRR), lue par la procédure de
/// fenêtre. La page la donne au chargement et à chaque changement de thème.
static FOND: AtomicU32 = AtomicU32::new(0x00FA_FDFE);

/// Chaque animation porte un numéro ; une nouvelle rend la précédente caduque.
/// Sans ça, deux transitions rapprochées se disputeraient la fenêtre image par
/// image.
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn colorref(rgb: [u8; 3]) -> u32 {
    rgb[0] as u32 | (rgb[1] as u32) << 8 | (rgb[2] as u32) << 16
}

fn hwnd_de(fenetre: &WebviewWindow) -> Option<isize> {
    fenetre.hwnd().ok().map(|h| h.0 as isize)
}

/// Les styles qu'on impose, quoi que tao recalcule.
///
/// — PAS dans Alt+Tab : une barre système n'est pas une application qu'on
///   bascule. `skipTaskbar` ne la retire que de la barre des tâches ; tao pose
///   `WS_EX_APPWINDOW` sur toute fenêtre sans parent, et c'est lui qui la
///   montre dans Alt+Tab.
/// — le fond peint SOUS le WebView2 : sans `WS_CLIPCHILDREN`, notre peinture
///   du fond passe aussi sous la fenêtre enfant de la page. Agrandie en
///   différé par wry, elle laisserait sinon une zone que personne ne peint. La
///   page, composée au-dessus, n'en est pas touchée.
fn styles(style: isize, ex: isize) -> (isize, isize) {
    (
        style & !(WS_CLIPCHILDREN.0 as isize),
        (ex & !(WS_EX_APPWINDOW.0 as isize)) | WS_EX_TOOLWINDOW.0 as isize,
    )
}

unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _ref: usize,
) -> LRESULT {
    match msg {
        // Le fond, à la couleur du thème. Tant que le WebView2 n'a pas peint
        // une zone tout juste découverte, c'est lui qu'on voit.
        WM_ERASEBKGND => {
            let mut r = RECT::default();
            let _ = GetClientRect(hwnd, &mut r);
            let pinceau = CreateSolidBrush(COLORREF(FOND.load(Ordering::Relaxed)));
            FillRect(HDC(wparam.0 as *mut _), &r, pinceau);
            let _ = DeleteObject(pinceau.into());
            LRESULT(1)
        }
        // D'abord wry (qui redimensionne le WebView2), puis le fond TOUT DE
        // SUITE : attendre `WM_PAINT`, qui passe en dernier dans la file,
        // laisserait le compositeur montrer la nouvelle taille sans fond.
        WM_SIZE => {
            let r = DefSubclassProc(hwnd, msg, wparam, lparam);
            let _ = RedrawWindow(
                Some(hwnd),
                None,
                None,
                RDW_INVALIDATE | RDW_ERASE | RDW_ERASENOW | RDW_NOCHILDREN,
            );
            r
        }
        WM_STYLECHANGING => {
            let s = &mut *(lparam.0 as *mut STYLESTRUCT);
            if wparam.0 as i32 == GWL_STYLE.0 {
                s.styleNew = styles(s.styleNew as isize, 0).0 as u32;
            } else if wparam.0 as i32 == GWL_EXSTYLE.0 {
                s.styleNew = styles(0, s.styleNew as isize).1 as u32;
            }
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

pub fn preparer(fenetre: &WebviewWindow) {
    let Some(h) = hwnd_de(fenetre) else { return };
    let hwnd = HWND(h as *mut _);
    unsafe {
        // Le coin arrondi de Windows 11, demandé EXPLICITEMENT : une fenêtre
        // sans décorations ne l'obtient pas toujours d'office.
        let coin: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &coin as *const _ as *const _,
            std::mem::size_of_val(&coin) as u32,
        );
        let _ = SetWindowSubclass(hwnd, Some(procedure), 0x4C49_5354, 0);
        // Les styles d'aujourd'hui ; `WM_STYLECHANGING` garde ceux de demain.
        let (style, ex) = styles(
            GetWindowLongPtrW(hwnd, GWL_STYLE),
            GetWindowLongPtrW(hwnd, GWL_EXSTYLE),
        );
        SetWindowLongPtrW(hwnd, GWL_STYLE, style);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

pub fn couleurs(fenetre: &WebviewWindow, fond: [u8; 3], lisere: [u8; 3]) {
    FOND.store(colorref(fond), Ordering::Relaxed);
    let _ = fenetre.set_background_color(Some(tauri::webview::Color(fond[0], fond[1], fond[2], 255)));
    let Some(h) = hwnd_de(fenetre) else { return };
    // Le liseré d'un pixel que Windows 11 trace autour de la fenêtre. Clair
    // par défaut : il cernerait de blanc une barre sombre.
    let couleur = colorref(lisere);
    unsafe {
        let _ = DwmSetWindowAttribute(
            HWND(h as *mut _),
            DWMWA_BORDER_COLOR,
            &couleur as *const _ as *const _,
            std::mem::size_of_val(&couleur) as u32,
        );
    }
}

/// Les marges invisibles autour du contenu (gauche, haut, droite, bas).
///
/// Pour garder l'ombre, tao conserve le cadre natif et le réduit à presque
/// rien : il reste une bordure de redimensionnement invisible sur trois côtés
/// et un pixel en haut. `SetWindowPos` place la fenêtre ENTIÈRE ; pour que le
/// CONTENU tombe au pixel près, on ajoute ces marges.
fn marges(fenetre: &WebviewWindow) -> (f64, f64, f64, f64) {
    let (Ok(ext), Ok(int), Ok(te), Ok(ti)) = (
        fenetre.outer_position(),
        fenetre.inner_position(),
        fenetre.outer_size(),
        fenetre.inner_size(),
    ) else {
        return (0.0, 0.0, 0.0, 0.0);
    };
    let gauche = (int.x - ext.x) as f64;
    let haut = (int.y - ext.y) as f64;
    let droite = te.width as f64 - ti.width as f64 - gauche;
    let bas = te.height as f64 - ti.height as f64 - haut;
    (gauche, haut, droite, bas)
}

fn placer(hwnd: isize, c: Cadre) {
    unsafe {
        // SYNCHRONE, sur le fil de la fenêtre : `WM_SIZE` et la peinture du
        // fond se font AVANT que l'appel rende la main. En asynchrone, le
        // compositeur montrait parfois la taille sans le fond.
        let _ = SetWindowPos(
            HWND(hwnd as *mut _),
            None,
            c.x.round() as i32,
            c.y.round() as i32,
            c.largeur.round() as i32,
            c.hauteur.round() as i32,
            SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }
}

/// Amène le CONTENU de `de` à `vers` (pixels physiques, coordonnées écran).
///
/// Une image par passe du compositeur (`DwmFlush` attend la suivante) : la
/// fenêtre bouge au rythme exact de l'écran. Chaque pas est exécuté sur le
/// fil de la fenêtre, voir `placer`.
pub fn poser(fenetre: &WebviewWindow, de: Cadre, vers: Cadre, duree: Duration) {
    let Some(hwnd) = hwnd_de(fenetre) else { return };
    let (g, h, d, b) = marges(fenetre);
    let exterieur = move |c: Cadre| Cadre {
        x: c.x - g,
        y: c.y - h,
        largeur: c.largeur + g + d,
        hauteur: c.hauteur + h + b,
    };
    let numero = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = fenetre.app_handle().clone();
    if duree.is_zero() {
        let cible = exterieur(vers);
        let _ = app.run_on_main_thread(move || placer(hwnd, cible));
        return;
    }
    std::thread::spawn(move || {
        let debut = Instant::now();
        loop {
            if GENERATION.load(Ordering::SeqCst) != numero {
                return;
            }
            let x = debut.elapsed().as_secs_f64() / duree.as_secs_f64();
            let cadre = exterieur(de.vers(vers, METAMORPHOSE.valeur(x.min(1.0))));
            let _ = app.run_on_main_thread(move || placer(hwnd, cadre));
            if x >= 1.0 {
                return;
            }
            unsafe {
                let _ = DwmFlush();
            }
        }
    });
}
