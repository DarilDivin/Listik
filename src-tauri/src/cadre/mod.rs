//! Le cadre de la barre rapide : une TOILE transparente, fixe, dont seules
//! les formes peintes existent pour la souris.
//!
//! La barre se métamorphose — capsule, bulle de réflexion, panneau de
//! réponse — et ses pastilles flottent à côté d'elle. Ces formes vivent dans
//! UNE page (la navigation au Tab passe de l'une à l'autre), donc dans une
//! fenêtre plus grande qu'elles. Ce qui rendait ce montage fragile, c'est
//! que la zone transparente autour avalait les clics destinés à
//! l'application d'en dessous. D'où les trois règles de ce module :
//!
//! — la toile a une taille FIXE, posée une fois à l'ouverture : l'écran est
//!   celui du pointeur, la barre s'accroche au cinquième haut de la zone
//!   utile et tout se déplie vers le bas. Rien ne la redimensionne en cours
//!   de route, donc rien ne saute ;
//! — la page annonce ses formes (`quick_formes`) dès qu'elles bougent ;
//! — un fil suit le pointeur et rend la fenêtre TRAVERSANTE dès qu'il sort
//!   des formes : un clic à côté de la barre atteint vraiment l'application
//!   d'en dessous, comme avec Spotlight.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

/// La fenêtre concernée.
pub const QUICK: &str = "quick";

/// La toile, en pixels CSS : assez pour agrandir un panneau (réponse,
/// Journal) à la poignée, avec sa marge d'ombre. La largeur tient sur tout
/// écran ; la hauteur se réduit à l'espace sous la barre (voir `ancrer`).
/// À TENIR IDENTIQUE à la fenêtre `quick` des tauri*.conf.json.
const TOILE: (f64, f64) = (1000.0, 860.0);
/// La hauteur en dessous de laquelle la toile ne descend pas : le Journal à
/// sa taille par défaut (600) et ses marges. Plutôt que de le tronquer, la
/// barre remonte.
const TOILE_HAUTEUR_MIN: f64 = 640.0;
/// La marge entre le haut de la toile et celui de la barre : la place de
/// l'ombre. À TENIR IDENTIQUE à `MARGE_HAUT` côté page.
const MARGE_HAUT: f64 = 24.0;
/// Le haut de la barre, en part de la hauteur utile de l'écran.
const HAUTEUR_ANCRE: f64 = 0.2;
/// Le rythme du suivi du pointeur pendant que la barre est ouverte.
const BATTEMENT: Duration = Duration::from_millis(16);

/// Une forme cliquable, en pixels CSS, relative au coin haut-gauche de la
/// toile : un rectangle aux coins arrondis.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct Forme {
    pub x: f64,
    pub y: f64,
    pub largeur: f64,
    pub hauteur: f64,
    pub rayon: f64,
}

impl Forme {
    /// Le point est-il DANS la forme, coins arrondis compris ? Un clic dans
    /// l'angle vide d'une capsule doit traverser, comme ailleurs.
    fn contient(&self, x: f64, y: f64) -> bool {
        let (droite, bas) = (self.x + self.largeur, self.y + self.hauteur);
        if x < self.x || y < self.y || x > droite || y > bas {
            return false;
        }
        let r = self.rayon.min(self.largeur / 2.0).min(self.hauteur / 2.0).max(0.0);
        let cx = if x < self.x + r {
            self.x + r
        } else if x > droite - r {
            droite - r
        } else {
            return true;
        };
        let cy = if y < self.y + r {
            self.y + r
        } else if y > bas - r {
            bas - r
        } else {
            return true;
        };
        (x - cx).powi(2) + (y - cy).powi(2) <= r * r
    }
}

/// L'état partagé entre la page (les formes), l'ouverture (l'origine) et le
/// fil qui suit le pointeur.
#[derive(Default)]
pub struct Geometrie {
    formes: Mutex<Vec<Forme>>,
    /// Le coin haut-gauche de la toile à l'écran (pixels physiques) et
    /// l'échelle de son écran. Gardés ici plutôt que relus : la fenêtre ne
    /// bouge pas pendant qu'elle est ouverte, et la relire coûterait un
    /// aller-retour par battement sur Mac.
    origine: Mutex<Option<(f64, f64, f64)>>,
    /// La barre est montrée : le fil ne tourne vite QUE pendant ce temps.
    ouverte: AtomicBool,
    /// L'état appliqué à la fenêtre, pour ne la toucher qu'aux changements.
    traversante: AtomicBool,
}

/// Choisit l'écran et pose la toile. À appeler JUSTE AVANT de montrer.
pub fn ancrer(fenetre: &WebviewWindow) {
    let ecran = fenetre
        .cursor_position()
        .ok()
        .and_then(|p| fenetre.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| fenetre.current_monitor().ok().flatten())
        .or_else(|| fenetre.primary_monitor().ok().flatten());
    let Some(ecran) = ecran else { return };
    let s = ecran.scale_factor();
    let zone = ecran.work_area();
    let (zx, zy) = (zone.position.x as f64, zone.position.y as f64);
    let (zl, zh) = (zone.size.width as f64, zone.size.height as f64);
    let l = (TOILE.0 * s).min(zl).round();
    let x = (zx + (zl - l) / 2.0).round();
    // Le haut de la BARRE au cinquième ; la toile commence une marge plus
    // haut, et descend jusqu'au bas de l'écran au plus. Sur un petit écran,
    // elle se réduit — et ne remonte la barre que si même le Journal par
    // défaut n'y tiendrait plus.
    let y = (zy + zh * HAUTEUR_ANCRE - MARGE_HAUT * s).round();
    let bas = zy + zh;
    let h = (TOILE.1 * s).min(bas - y).max((TOILE_HAUTEUR_MIN * s).min(zh)).round();
    let y = y.min(bas - h).max(zy);

    let _ = fenetre.set_size(PhysicalSize::new(l as u32, h as u32));
    let _ = fenetre.set_position(PhysicalPosition::new(x as i32, y as i32));
    *fenetre.state::<Geometrie>().origine.lock().unwrap() = Some((x, y, s));
}

/// Montre la barre et lui donne le clavier.
///
/// Sur Mac, SANS activer l'application : c'est tout l'intérêt d'un panneau.
/// `set_focus` de Tauri activerait Listik, et la barre des menus avec.
pub fn montrer(fenetre: &WebviewWindow) -> tauri::Result<()> {
    use tauri::Emitter;
    fenetre.state::<Geometrie>().ouverte.store(true, Ordering::SeqCst);
    fenetre.show()?;
    // La page apprend l'ouverture par ce signal, pas par le focus : un
    // événement de focus peut se perdre (première ouverture juste après le
    // lancement), et une page qui se croit fermée n'envoie pas ses formes —
    // la barre deviendrait traversante de part en part.
    let _ = fenetre.emit("quick:montree", ());
    #[cfg(target_os = "macos")]
    macos::montrer(fenetre);
    #[cfg(not(target_os = "macos"))]
    fenetre.set_focus()?;
    // Tout de suite, sans attendre le battement : le premier clic ne doit
    // pas tomber sur un état d'avant.
    actualiser(fenetre);
    Ok(())
}

pub fn cacher(fenetre: &WebviewWindow) -> tauri::Result<()> {
    let geometrie = fenetre.state::<Geometrie>();
    geometrie.ouverte.store(false, Ordering::SeqCst);
    // Les formes d'une barre fermée ne valent plus rien : à la prochaine
    // ouverture, on attend celles de la page.
    geometrie.formes.lock().unwrap().clear();
    fenetre.hide()
}

/// Rend la fenêtre traversante si le pointeur n'est sur aucune forme.
fn actualiser(fenetre: &WebviewWindow) {
    let geometrie = fenetre.state::<Geometrie>();
    let Some((ox, oy, s)) = *geometrie.origine.lock().unwrap() else { return };
    let Ok(p) = fenetre.cursor_position() else { return };
    let (x, y) = ((p.x - ox) / s, (p.y - oy) / s);
    let formes = geometrie.formes.lock().unwrap();
    // Sans forme connue (la page n'a encore rien envoyé), on RETIENT la
    // souris : mieux vaut un clic avalé qu'une barre qu'on ne peut pas
    // toucher.
    let dedans = formes.is_empty() || formes.iter().any(|f| f.contient(x, y));
    drop(formes);
    let traversante = !dedans;
    if geometrie.traversante.swap(traversante, Ordering::SeqCst) != traversante {
        appliquer(fenetre, traversante);
    }
}

fn appliquer(fenetre: &WebviewWindow, traversante: bool) {
    #[cfg(windows)]
    windows::traversante(fenetre, traversante);
    #[cfg(not(windows))]
    let _ = fenetre.set_ignore_cursor_events(traversante);
}

/// Le fil qui suit le pointeur. Il ne bat vite que barre ouverte ; fermée,
/// il dort — une boucle à 60 Hz toute la journée viderait la batterie.
fn suivre_le_pointeur(app: AppHandle) {
    std::thread::spawn(move || loop {
        let Some(fenetre) = app.get_webview_window(QUICK) else {
            std::thread::sleep(Duration::from_secs(1));
            continue;
        };
        if fenetre.state::<Geometrie>().ouverte.load(Ordering::SeqCst) {
            actualiser(&fenetre);
            std::thread::sleep(BATTEMENT);
        } else {
            std::thread::sleep(Duration::from_millis(250));
        }
    });
}

/// La page annonce ses formes cliquables, dès qu'elles bougent.
#[tauri::command]
pub fn quick_formes(fenetre: WebviewWindow, formes: Vec<Forme>) {
    *fenetre.state::<Geometrie>().formes.lock().unwrap() = formes;
    // Sur Mac, l'ombre est celle du système et suit la forme peinte — mais
    // il la garde en cache. On la fait recalculer à chaque mouvement.
    #[cfg(target_os = "macos")]
    macos::rafraichir_ombre(&fenetre);
}

/// Prépare la fenêtre au démarrage : ce qui ne change plus ensuite.
pub fn preparer(app: &AppHandle) {
    let Some(fenetre) = app.get_webview_window(QUICK) else { return };
    #[cfg(windows)]
    windows::preparer(&fenetre);
    #[cfg(target_os = "macos")]
    macos::preparer(&fenetre);
    suivre_le_pointeur(app.clone());
}

/// Les scènes que parcourt l'essai automatique, dans l'ordre.
const SCENES_ESSAI: [&str; 9] = [
    "neutre",
    "saisie",
    "tache",
    "journal",
    "reflexion",
    "reponse",
    "reponse-sombre",
    "neutre-sombre",
    "retour",
];

/// L'ESSAI AUTOMATIQUE de la barre, pour la CI macOS — personne n'y a de Mac
/// pour la regarder. Si `LISTIK_ESSAI_RAPIDE` désigne un dossier, l'app ouvre
/// la barre, la fait passer par chaque scène (la page obéit à
/// `quick:essai-scene`) et, sur Mac, en prend une capture d'écran dans ce
/// dossier — plus une courte vidéo d'une métamorphose, pour voir l'ombre la
/// suivre. Sans la variable, rien ne se passe.
pub fn essai_si_demande(app: &AppHandle) {
    let Ok(dossier) = std::env::var("LISTIK_ESSAI_RAPIDE") else { return };
    let app = app.clone();
    std::thread::spawn(move || {
        use tauri::Emitter;
        // Le temps que la page de la barre soit chargée et à l'écoute.
        std::thread::sleep(Duration::from_secs(8));
        let Some(fenetre) = app.get_webview_window(QUICK) else { return };
        let _ = fenetre.emit("quick:essai-scene", "debut");
        ancrer(&fenetre);
        let _ = montrer(&fenetre);
        for (rang, scene) in SCENES_ESSAI.iter().enumerate() {
            // La métamorphose réflexion → panneau de réponse, filmée.
            let video = (*scene == "reponse").then(|| filmer(&dossier, "metamorphose"));
            let _ = fenetre.emit("quick:essai-scene", scene);
            // Assez pour qu'une métamorphose (0,58 s) soit finie.
            std::thread::sleep(Duration::from_millis(2500));
            if let Some(Some(mut enfant)) = video {
                let _ = enfant.wait();
            }
            capturer(&dossier, rang, scene);
        }
    });
}

fn capturer(dossier: &str, rang: usize, scene: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::fs::create_dir_all(dossier);
        let chemin = format!("{dossier}/{rang:02}-{scene}.png");
        let _ = std::process::Command::new("screencapture").args(["-x", &chemin]).status();
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (dossier, rang, scene);
}

/// Une vidéo de 2 s de l'écran, lancée en arrière-plan.
fn filmer(dossier: &str, nom: &str) -> Option<std::process::Child> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::fs::create_dir_all(dossier);
        let chemin = format!("{dossier}/{nom}.mov");
        std::process::Command::new("screencapture")
            .args(["-x", "-v", "-V", "2", &chemin])
            .spawn()
            .ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (dossier, nom);
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capsule() -> Forme {
        Forme { x: 100.0, y: 24.0, largeur: 420.0, hauteur: 52.0, rayon: 26.0 }
    }

    #[test]
    fn le_milieu_et_les_bords_droits_sont_dedans() {
        let f = capsule();
        assert!(f.contient(300.0, 50.0));
        assert!(f.contient(300.0, 24.5));
        assert!(f.contient(126.0, 74.0));
    }

    #[test]
    fn l_angle_vide_d_une_capsule_traverse() {
        let f = capsule();
        // Le coin du rectangle englobant, hors de l'arrondi.
        assert!(!f.contient(101.0, 25.0));
        assert!(!f.contient(519.0, 75.0));
        // Juste à l'intérieur de l'arrondi.
        assert!(f.contient(104.0, 50.0));
    }

    #[test]
    fn hors_du_rectangle_englobant() {
        let f = capsule();
        assert!(!f.contient(99.0, 50.0));
        assert!(!f.contient(300.0, 77.0));
    }

    #[test]
    fn un_rayon_trop_grand_est_borne() {
        let rond = Forme { x: 0.0, y: 0.0, largeur: 64.0, hauteur: 64.0, rayon: 999.0 };
        assert!(rond.contient(32.0, 32.0));
        assert!(!rond.contient(2.0, 2.0));
    }
}
