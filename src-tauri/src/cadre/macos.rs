//! La toile sur macOS : un vrai panneau, comme Spotlight.
//!
//! — NON ACTIVANT : l'ouvrir ne fait pas passer Listik au premier plan. La
//!   barre des menus reste celle de l'application qu'on utilisait, et en
//!   refermant on retombe exactement où l'on était. Seul un `NSPanel` sait
//!   faire ça (`NSWindowStyleMaskNonactivatingPanel` n'a d'effet que sur lui) :
//!   la fenêtre de tao change donc de classe, vers une sous-classe de
//!   `NSPanel` — c'est ce que fait aussi `tauri-nspanel`. La classe de tao
//!   porte une donnée (`focusable`), lue seulement par les deux méthodes que
//!   le panneau remplace.
//! — sur TOUS les bureaux et par-dessus une application en plein écran ;
//! — hors du cycle ⌘` des fenêtres.
//!
//! L'OMBRE est celle du système. La fenêtre étant transparente, macOS la
//! calcule d'après ce qui est peint : elle épouse la capsule, les pastilles,
//! la bulle, le panneau — toutes les formes à la fois. Mais il la garde en
//! cache : on la fait recalculer à chaque mouvement des formes, et une
//! dernière fois une fois tout au repos.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use objc2::runtime::AnyObject;
use objc2::{define_class, ClassType, MainThreadOnly};
use objc2_app_kit::{
    NSPanel, NSResponder, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior,
    NSWindowStyleMask,
};
use objc2_foundation::NSObject;
use tauri::WebviewWindow;

define_class!(
    // La chaîne complète des ancêtres, comme l'exige `define_class!`.
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "ListikPanneauRapide"]
    struct Panneau;

    impl Panneau {
        /// On doit pouvoir y taper : un panneau ne devient pas « clé » de
        /// lui-même s'il n'a pas de barre de titre.
        #[unsafe(method(canBecomeKeyWindow))]
        fn peut_devenir_cle(&self) -> bool {
            true
        }

        /// Mais jamais fenêtre PRINCIPALE : c'est ce qui laisse l'application
        /// d'en dessous au premier plan.
        #[unsafe(method(canBecomeMainWindow))]
        fn peut_devenir_principale(&self) -> bool {
            false
        }
    }
);

/// Le pointeur de la fenêtre native, transportable d'un fil à l'autre. On ne
/// s'en sert QUE sur le fil principal.
fn pointeur(fenetre: &WebviewWindow) -> Option<usize> {
    fenetre.ns_window().ok().map(|p| p as usize)
}

/// # Safety
/// `ptr` doit être la `NSWindow` vivante de la fenêtre, et l'appel doit se
/// faire sur le fil principal.
unsafe fn fenetre_native<'a>(ptr: usize) -> &'a NSWindow {
    &*(ptr as *const NSWindow)
}

pub fn preparer(fenetre: &WebviewWindow) {
    let Some(ptr) = pointeur(fenetre) else { return };
    let _ = fenetre.run_on_main_thread(move || unsafe {
        let objet = &*(ptr as *const AnyObject);
        AnyObject::set_class(objet, Panneau::class());

        let fen = fenetre_native(ptr);
        fen.setStyleMask(fen.styleMask() | NSWindowStyleMask::NonactivatingPanel);
        fen.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        // Au-dessus des fenêtres flottantes ordinaires, comme les lanceurs.
        fen.setLevel(NSStatusWindowLevel);
        // Un panneau se cache par défaut quand l'application perd la main.
        // Or la nôtre ne la prend jamais : c'est la perte du FOCUS de la barre
        // (côté page) qui décide de la fermer.
        fen.setHidesOnDeactivate(false);
        fen.setHasShadow(true);
        let panneau = &*(ptr as *const NSPanel);
        panneau.setFloatingPanel(true);
    });
}

/// Montre le panneau SANS activer l'application : `orderFrontRegardless` le
/// pose devant, `makeKeyWindow` lui donne le clavier. `set_focus` de Tauri,
/// lui, activerait Listik tout entier.
///
/// Le clavier doit aussi aller à la PAGE : une fenêtre clé dont le premier
/// répondeur est la fenêtre elle-même avale la frappe, et le champ en
/// autofocus resterait muet jusqu'au premier clic.
pub fn montrer(fenetre: &WebviewWindow) {
    let _ = fenetre.with_webview(|vue| unsafe {
        let fen = fenetre_native(vue.ns_window() as usize);
        fen.orderFrontRegardless();
        fen.makeKeyWindow();
        let page = &*(vue.inner() as *const NSResponder);
        fen.makeFirstResponder(Some(page));
    });
}

/// Chaque demande porte un numéro : seule la DERNIÈRE programme le recalcul
/// final, une fois les formes au repos.
static DERNIERE: AtomicU64 = AtomicU64::new(0);

/// Fait recalculer l'ombre tout de suite — elle suit la métamorphose avec
/// une image de retard — puis une dernière fois 120 ms après le dernier
/// mouvement : au repos, l'ombre doit coller EXACTEMENT à la forme.
pub fn rafraichir_ombre(fenetre: &WebviewWindow) {
    let Some(ptr) = pointeur(fenetre) else { return };
    let _ = fenetre.run_on_main_thread(move || unsafe { fenetre_native(ptr).invalidateShadow() });

    let numero = DERNIERE.fetch_add(1, Ordering::SeqCst) + 1;
    let fenetre = fenetre.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        if DERNIERE.load(Ordering::SeqCst) == numero {
            let _ = fenetre.run_on_main_thread(move || unsafe { fenetre_native(ptr).invalidateShadow() });
        }
    });
}
