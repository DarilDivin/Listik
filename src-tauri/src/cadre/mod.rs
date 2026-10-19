//! Le cadre natif de la barre rapide.
//!
//! Spotlight et les barres de Windows sont construits de la même façon : la
//! FENÊTRE est la barre. Pas de grand canevas transparent autour d'une forme
//! dessinée en CSS — c'est le système qui trace le contour et l'ombre, et un
//! clic à côté tombe dans l'application d'en dessous.
//!
//! La géométrie vit ICI, pas dans la page :
//!
//! — l'écran et le point d'ancrage sont choisis UNE fois, à l'ouverture (sous
//!   le pointeur, au cinquième haut de la zone utile). Les relire à chaque
//!   changement de scène faisait sauter la barre, et pouvait même l'envoyer
//!   sur un autre écran en pleine conversation ;
//! — le bord HAUT reste fixe et la barre grandit vers le bas, comme Spotlight
//!   quand ses résultats arrivent ;
//! — elle grandit D'UN COUP (le contenu entre en fondu, côté page) et se
//!   resserre en s'ANIMANT. Mesuré sous Windows : agrandie image par image, la
//!   page web arrive une à deux images après le cadre, et la bande découverte
//!   laisse voir ce qu'il y a derrière. Resserrée, rien n'est découvert —
//!   l'animation y est propre.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, WebviewWindow};

// La courbe n'est calculée à la main que sous Windows : sur Mac, Core
// Animation l'applique elle-même.
#[cfg_attr(not(windows), allow(dead_code))]
pub mod courbe;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

/// La fenêtre concernée.
pub const QUICK: &str = "quick";

/// `MORPH_DURATION` côté page (app/quick/page.tsx).
const DUREE: Duration = Duration::from_millis(580);
/// Le haut de la barre, en part de la hauteur utile de l'écran.
const HAUTEUR_ANCRE: f64 = 0.2;
/// La distance minimale au bas de l'écran, en pixels CSS.
const MARGE_BAS: f64 = 24.0;

/// Un rectangle à l'écran, en pixels physiques.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cadre {
    pub x: f64,
    pub y: f64,
    pub largeur: f64,
    pub hauteur: f64,
}

impl Cadre {
    /// Le cadre à l'avancement `p` (0 = `self`, 1 = `vers`).
    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn vers(self, vers: Cadre, p: f64) -> Cadre {
        let m = |a: f64, b: f64| a + (b - a) * p;
        Cadre {
            x: m(self.x, vers.x),
            y: m(self.y, vers.y),
            largeur: m(self.largeur, vers.largeur),
            hauteur: m(self.hauteur, vers.hauteur),
        }
    }

    fn bas(&self) -> f64 {
        self.y + self.hauteur
    }
}

/// Le point où la barre s'accroche, choisi à l'ouverture.
#[derive(Debug, Clone, Copy)]
struct Ancre {
    centre_x: f64,
    haut: f64,
    /// La zone utile de l'écran (sans la barre des tâches ni le Dock).
    zone: Cadre,
    echelle: f64,
}

impl Ancre {
    /// Le rectangle de CONTENU pour une scène de `largeur` × `hauteur` pixels
    /// CSS : centré sous l'ancre, le haut fixe. Une scène trop haute pour
    /// l'espace restant remonte plutôt que de déborder de l'écran.
    fn contenu(&self, largeur: f64, hauteur: f64) -> Cadre {
        let l = (largeur * self.echelle).round();
        let h = (hauteur * self.echelle).round();
        let plancher = self.zone.bas() - MARGE_BAS * self.echelle;
        let y = if self.haut + h > plancher {
            (plancher - h).max(self.zone.y)
        } else {
            self.haut
        };
        Cadre { x: (self.centre_x - l / 2.0).round(), y: y.round(), largeur: l, hauteur: h }
    }
}

/// L'état de la géométrie, partagé entre l'ouverture (Rust) et les scènes
/// (la page, par `quick_cadre`).
#[derive(Default)]
pub struct Geometrie {
    ancre: Mutex<Option<Ancre>>,
    /// Le dernier rectangle de contenu demandé : le point de départ de la
    /// prochaine animation. Relire la fenêtre en pleine animation donnerait
    /// une étape intermédiaire.
    contenu: Mutex<Option<Cadre>>,
    /// La dernière taille de scène annoncée, en pixels CSS. C'est elle qu'on
    /// pose à l'ouverture — pas la taille de la fenêtre, qui peut être prise
    /// au milieu d'une animation.
    scene: Mutex<Option<(f64, f64)>>,
}

fn calculer_ancre(fenetre: &WebviewWindow) -> Option<Ancre> {
    let ecran = fenetre
        .cursor_position()
        .ok()
        .and_then(|p| fenetre.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| fenetre.current_monitor().ok().flatten())
        .or_else(|| fenetre.primary_monitor().ok().flatten())?;
    let zone = ecran.work_area();
    let zone = Cadre {
        x: zone.position.x as f64,
        y: zone.position.y as f64,
        largeur: zone.size.width as f64,
        hauteur: zone.size.height as f64,
    };
    Some(Ancre {
        centre_x: zone.x + zone.largeur / 2.0,
        haut: (zone.y + zone.hauteur * HAUTEUR_ANCRE).round(),
        zone,
        echelle: ecran.scale_factor(),
    })
}

/// Choisit l'écran et le point d'ancrage, et y pose la barre telle qu'elle
/// est. À appeler JUSTE AVANT de montrer la fenêtre.
pub fn ancrer(fenetre: &WebviewWindow) {
    let Some(ancre) = calculer_ancre(fenetre) else { return };
    let geometrie = fenetre.state::<Geometrie>();
    *geometrie.ancre.lock().unwrap() = Some(ancre);
    // La scène est conservée : la page la remet au neutre avant de cacher la
    // fenêtre.
    let scene = *geometrie.scene.lock().unwrap();
    let taille = scene.or_else(|| {
        fenetre.inner_size().ok().map(|t| {
            (t.width as f64 / ancre.echelle, t.height as f64 / ancre.echelle)
        })
    });
    if let Some((largeur, hauteur)) = taille {
        let cible = ancre.contenu(largeur, hauteur);
        poser(fenetre, cible, cible, Duration::ZERO, ancre.echelle);
        *geometrie.contenu.lock().unwrap() = Some(cible);
    }
}

/// Amène le contenu de `de` à `vers`. `echelle` : celle de l'écran de
/// l'ancre (macOS compte en points).
fn poser(fenetre: &WebviewWindow, de: Cadre, vers: Cadre, duree: Duration, echelle: f64) {
    #[cfg(windows)]
    {
        let _ = echelle;
        windows::poser(fenetre, de, vers, duree);
    }

    #[cfg(target_os = "macos")]
    {
        let _ = de;
        macos::poser(fenetre, vers, duree, echelle);
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        use tauri::{PhysicalPosition, PhysicalSize};
        let _ = (de, duree, echelle);
        let _ = fenetre.set_size(PhysicalSize::new(vers.largeur as u32, vers.hauteur as u32));
        let _ = fenetre.set_position(PhysicalPosition::new(vers.x as i32, vers.y as i32));
    }
}

/// Montre la barre et lui donne le clavier.
///
/// Sur Mac, SANS activer l'application : c'est tout l'intérêt d'un panneau.
/// `set_focus` de Tauri activerait Listik, et la barre des menus avec.
pub fn montrer(fenetre: &WebviewWindow) -> tauri::Result<()> {
    fenetre.show()?;
    #[cfg(target_os = "macos")]
    macos::montrer(fenetre);
    #[cfg(not(target_os = "macos"))]
    fenetre.set_focus()?;
    Ok(())
}

/// La page annonce la taille de sa scène, en pixels CSS. Le cadre s'y
/// ajuste : d'un coup s'il grandit, en s'animant s'il se resserre (et si
/// `anime` le permet).
#[tauri::command]
pub fn quick_cadre(fenetre: WebviewWindow, largeur: f64, hauteur: f64, anime: bool) -> Result<(), String> {
    let geometrie = fenetre.state::<Geometrie>();
    let ancre = {
        let mut ancre = geometrie.ancre.lock().unwrap();
        if ancre.is_none() {
            *ancre = calculer_ancre(&fenetre);
        }
        (*ancre).ok_or("aucun écran")?
    };
    *geometrie.scene.lock().unwrap() = Some((largeur, hauteur));
    let vers = ancre.contenu(largeur, hauteur);
    let mut contenu = geometrie.contenu.lock().unwrap();
    let de = contenu.unwrap_or(vers);
    if de == vers {
        return Ok(());
    }
    let resserre = vers.largeur <= de.largeur && vers.hauteur <= de.hauteur;
    let duree = if anime && resserre { DUREE } else { Duration::ZERO };
    poser(&fenetre, de, vers, duree, ancre.echelle);
    *contenu = Some(vers);
    Ok(())
}

/// Les couleurs du thème, pour ce que le système peint lui-même : le fond
/// découvert pendant un agrandissement, et le liseré d'un pixel de Windows 11.
#[tauri::command]
pub fn quick_couleurs(fenetre: WebviewWindow, fond: [u8; 3], lisere: [u8; 3]) -> Result<(), String> {
    #[cfg(windows)]
    windows::couleurs(&fenetre, fond, lisere);
    #[cfg(not(windows))]
    let _ = (&fenetre, fond, lisere);
    Ok(())
}

/// Prépare la fenêtre au démarrage : ce qui ne change plus ensuite.
pub fn preparer(fenetre: &WebviewWindow) {
    #[cfg(windows)]
    windows::preparer(fenetre);
    #[cfg(target_os = "macos")]
    macos::preparer(fenetre);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = fenetre;
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
/// dossier. Sans la variable, rien ne se passe.
pub fn essai_si_demande(app: &tauri::AppHandle) {
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
            let _ = fenetre.emit("quick:essai-scene", scene);
            // Assez pour qu'un resserrement animé (0,58 s) soit fini.
            std::thread::sleep(Duration::from_millis(2500));
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

#[cfg(test)]
mod tests {
    use super::*;

    fn ancre() -> Ancre {
        Ancre {
            centre_x: 960.0,
            haut: 216.0,
            zone: Cadre { x: 0.0, y: 0.0, largeur: 1920.0, hauteur: 1080.0 },
            echelle: 1.0,
        }
    }

    #[test]
    fn centre_sous_l_ancre_le_haut_fixe() {
        let c = ancre().contenu(600.0, 52.0);
        assert_eq!(c, Cadre { x: 660.0, y: 216.0, largeur: 600.0, hauteur: 52.0 });
        // Le panneau garde le même haut : il grandit vers le bas.
        assert_eq!(ancre().contenu(600.0, 480.0).y, 216.0);
    }

    #[test]
    fn remonte_plutot_que_de_deborder() {
        let c = ancre().contenu(600.0, 1000.0);
        assert!(c.bas() <= 1080.0 - MARGE_BAS);
        assert!(c.y >= 0.0);
    }

    #[test]
    fn suit_l_echelle_de_l_ecran() {
        let a = Ancre { echelle: 1.5, ..ancre() };
        let c = a.contenu(600.0, 52.0);
        assert_eq!((c.largeur, c.hauteur), (900.0, 78.0));
        assert_eq!(c.x, 960.0 - 450.0);
    }
}
