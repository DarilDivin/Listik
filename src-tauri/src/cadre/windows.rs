//! La toile sous Windows : transparente, hors d'Alt+Tab, et traversante à
//! la demande.
//!
//! TRAVERSANTE : une fenêtre `WS_EX_LAYERED` laisse passer les clics quand
//! elle porte aussi `WS_EX_TRANSPARENT`. tao sait le faire
//! (`set_ignore_cursor_events`), mais il bascule les DEUX drapeaux à chaque
//! fois — et une fenêtre qui redevient « layered » sans réglage d'opacité
//! peut disparaître. On la rend donc layered UNE fois, opaque à 100 %, et on
//! ne bascule plus que `WS_EX_TRANSPARENT`. Mesuré : le rendu du WebView2 ne
//! bouge pas, et les clics passent bien à la fenêtre d'en dessous.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::WebviewWindow;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
    LWA_ALPHA, STYLESTRUCT, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_NOZORDER, WM_STYLECHANGING, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

/// L'état traversant voulu. La procédure de fenêtre le relit à CHAQUE
/// réécriture des styles : tao les recalcule à l'affichage, au masquage et à
/// d'autres changements d'état, et effacerait sinon nos drapeaux.
static TRAVERSANTE: AtomicBool = AtomicBool::new(false);

fn hwnd_de(fenetre: &WebviewWindow) -> Option<HWND> {
    fenetre.hwnd().ok().map(|h| HWND(h.0))
}

/// Les styles étendus qu'on impose, quoi que tao recalcule.
///
/// — LAYERED toujours (voir l'en-tête), TRANSPARENT selon le pointeur ;
/// — PAS dans Alt+Tab : une barre système n'est pas une application qu'on
///   bascule. `skipTaskbar` ne la retire que de la barre des tâches ; tao pose
///   `WS_EX_APPWINDOW` sur toute fenêtre sans parent, et c'est lui qui la
///   montre dans Alt+Tab.
fn styles_etendus(ex: isize) -> isize {
    let mut ex = (ex & !(WS_EX_APPWINDOW.0 as isize)) | (WS_EX_TOOLWINDOW.0 | WS_EX_LAYERED.0) as isize;
    if TRAVERSANTE.load(Ordering::SeqCst) {
        ex |= WS_EX_TRANSPARENT.0 as isize;
    } else {
        ex &= !(WS_EX_TRANSPARENT.0 as isize);
    }
    ex
}

unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _ref: usize,
) -> LRESULT {
    if msg == WM_STYLECHANGING && wparam.0 as i32 == GWL_EXSTYLE.0 {
        let s = &mut *(lparam.0 as *mut STYLESTRUCT);
        s.styleNew = styles_etendus(s.styleNew as isize) as u32;
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

pub fn preparer(fenetre: &WebviewWindow) {
    let Some(hwnd) = hwnd_de(fenetre) else { return };
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(procedure), 0x4C49_5354, 0);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, styles_etendus(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)));
        // Opaque à 100 % : c'est la page qui porte la transparence.
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
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

pub fn traversante(fenetre: &WebviewWindow, traversante: bool) {
    TRAVERSANTE.store(traversante, Ordering::SeqCst);
    let Some(hwnd) = hwnd_de(fenetre) else { return };
    unsafe {
        // `styles_etendus` lit TRAVERSANTE, déjà à jour.
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, styles_etendus(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)));
    }
}
