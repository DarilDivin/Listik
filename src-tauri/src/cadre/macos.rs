//! Le cadre natif sur macOS : un vrai panneau, comme Spotlight.
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
//! L'ombre est celle du système. La fenêtre étant transparente, macOS la
//! calcule d'après ce qui est peint : elle épouse la capsule. Mais il la garde
//! en cache — on la fait recalculer après chaque changement de forme.

use std::ptr::NonNull;
use std::time::Duration;

use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2::{define_class, ClassType, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAnimatablePropertyContainer, NSAnimationContext, NSPanel, NSResponder, NSScreen,
    NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::{NSObject, NSPoint, NSRect, NSSize};
use objc2_quartz_core::CAMediaTimingFunction;
use tauri::WebviewWindow;

use super::Cadre;

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

/// Pixels physiques, origine en haut à gauche (Tauri) → points, origine en
/// bas à gauche de l'écran principal (AppKit).
fn rect_appkit(c: Cadre, echelle: f64, hauteur_principal: f64) -> NSRect {
    let l = c.largeur / echelle;
    let h = c.hauteur / echelle;
    NSRect::new(
        NSPoint::new(c.x / echelle, hauteur_principal - c.y / echelle - h),
        NSSize::new(l, h),
    )
}

/// Fait recalculer l'ombre un peu plus tard : après un agrandissement, la
/// page n'a peint sa nouvelle forme qu'une ou deux images après le cadre.
fn rafraichir_ombre_bientot(fenetre: &WebviewWindow, ptr: usize) {
    let fenetre = fenetre.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        let _ = fenetre.run_on_main_thread(move || unsafe { fenetre_native(ptr).invalidateShadow() });
    });
}

pub fn poser(fenetre: &WebviewWindow, vers: Cadre, duree: Duration, echelle: f64) {
    let Some(ptr) = pointeur(fenetre) else { return };
    let suite = fenetre.clone();
    let _ = fenetre.run_on_main_thread(move || unsafe {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let Some(principal) = NSScreen::screens(mtm).firstObject() else { return };
        let rect = rect_appkit(vers, echelle, principal.frame().size.height);
        let fen = fenetre_native(ptr);

        if duree.is_zero() {
            fen.setFrame_display(rect, true);
            fen.invalidateShadow();
            rafraichir_ombre_bientot(&suite, ptr);
            return;
        }

        // Le resserrement, animé par Core Animation avec la courbe de la page
        // (`MORPH_EASE`). `setFrame:display:animate:` imposerait la durée et
        // la courbe du système.
        let secondes = duree.as_secs_f64();
        let changements = RcBlock::new(move |contexte: NonNull<NSAnimationContext>| {
            let contexte = contexte.as_ref();
            contexte.setDuration(secondes);
            contexte.setTimingFunction(Some(&CAMediaTimingFunction::functionWithControlPoints(
                0.22, 0.9, 0.28, 1.0,
            )));
            fenetre_native(ptr).animator().setFrame_display(rect, true);
        });
        let fin = RcBlock::new(move || fenetre_native(ptr).invalidateShadow());
        NSAnimationContext::runAnimationGroup_completionHandler(&changements, Some(&fin));
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
