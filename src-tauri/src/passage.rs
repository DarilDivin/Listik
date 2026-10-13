//! Faire partir un passage du journal : un PDF, une image, un document Word.
//!
//! La MISE EN PAGE du PDF et de l'image vit dans le webview
//! (`features/journal/partage.ts`) : c'est lui qui a les polices et le rendu
//! du texte. Rust fait ce que le webview ne peut pas faire seul — lire une
//! photo rangée sur le disque, écrire un fichier à l'endroit choisi, demander
//! à WebView2 d'imprimer la page en PDF — et compose le .docx (`word.rs`).

use crate::db::{self, AppState};
use tauri::{AppHandle, State};

/// Les octets d'une IMAGE jointe au journal.
///
/// Le webview pourrait la lire par le protocole `asset:`, mais c'est une autre
/// origine que la page : une image à dessiner sur un canvas (l'export en PNG)
/// ou à glisser dans un .docx reviendrait « teintée » et illisible. Les octets
/// passent donc par ici, et la page en fait une URL `data:` à elle.
#[tauri::command]
pub async fn lire_image_piece(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<tauri::ipc::Response, String> {
    let fiche = db::list_journal_pieces(&state.pool, &db::dossier_pieces(&app)?, &[id])
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("Pièce introuvable.")?;
    // Une note vocale ou un PDF joint n'ont rien à faire dans un texte
    // imprimé : la page ne les demande pas, et on ne les rend pas.
    if fiche.kind != "image" {
        return Err("Cette pièce n'est pas une image.".into());
    }
    let octets = std::fs::read(&fiche.chemin).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(octets))
}

/// Les formats que la page écrit elle-même : l'image seulement. Le PDF est
/// écrit par WebView2 (`imprimer_passage`), le .docx par Rust (`exporter_word`).
const ECRITS_PAR_LA_PAGE: &[&str] = &["png"];

/// Vérifie le chemin d'un fichier à écrire et rend sa forme lisible.
///
/// Il arrive encodé (`encodeURIComponent`) dans un EN-TÊTE de la requête : le
/// corps porte les octets bruts, et un en-tête n'accepte pas les accents d'un
/// titre — « Été.png » n'y passerait pas tel quel.
pub fn chemin_a_ecrire(encode: &str) -> Result<std::path::PathBuf, String> {
    let chemin = percent_encoding::percent_decode_str(encode)
        .decode_utf8()
        .map_err(|_| "Chemin illisible.".to_string())?;
    let chemin = std::path::PathBuf::from(chemin.as_ref());
    // Le chemin vient du dialogue « Enregistrer sous », mais la page n'est
    // pas une autorité : on n'écrit que les formats qu'elle sait produire.
    let ext = chemin
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !ECRITS_PAR_LA_PAGE.contains(&ext.as_str()) {
        return Err(format!("Format refusé : « {ext} »."));
    }
    Ok(chemin)
}

/// Écrit un fichier produit par la page — une image.
///
/// Les octets arrivent BRUTS, en corps de requête : une image de plusieurs
/// mégaoctets en tableau de nombres JSON pèserait quatre fois plus lourd, et
/// la page gèlerait le temps de la sérialiser.
#[tauri::command]
pub async fn ecrire_passage(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(octets) = request.body() else {
        return Err("Rien à écrire.".into());
    };
    let encode = request
        .headers()
        .get("chemin")
        .and_then(|v| v.to_str().ok())
        .ok_or("Chemin manquant.")?;
    std::fs::write(chemin_a_ecrire(encode)?, octets).map_err(|e| e.to_string())
}

/// Compose le passage en .docx et l'écrit à `chemin`.
///
/// Les photos sont lues ICI, par leur identifiant : elles ne font pas
/// l'aller-retour par la page, et une pièce qui n'est pas une image (PDF
/// joint, note vocale) ou qu'on ne sait pas décoder est simplement absente.
#[tauri::command]
pub async fn exporter_word(
    state: State<'_, AppState>,
    app: AppHandle,
    chemin: String,
    blocs: Vec<crate::word::Bloc>,
) -> Result<(), String> {
    let cible = std::path::PathBuf::from(&chemin);
    let ext = cible.extension().and_then(|e| e.to_str()).unwrap_or_default();
    if !ext.eq_ignore_ascii_case("docx") {
        return Err(format!("Format refusé : « {ext} »."));
    }

    let ids: Vec<String> = blocs
        .iter()
        .filter_map(|b| match b {
            crate::word::Bloc::Piece { piece_id, .. } => Some(piece_id.clone()),
            _ => None,
        })
        .collect();
    let fiches = db::list_journal_pieces(&state.pool, &db::dossier_pieces(&app)?, &ids)
        .await
        .map_err(|e| e.to_string())?;
    let images = fiches
        .into_iter()
        .filter(|f| f.kind == "image")
        .filter_map(|f| {
            let octets = std::fs::read(&f.chemin).ok()?;
            Some((f.id, crate::word::image_pour_word(&octets)?))
        })
        .collect();

    let docx = crate::word::document_word(&blocs, &images)?;
    std::fs::write(cible, docx).map_err(|e| e.to_string())
}

/// Imprime la page en PDF, à `chemin`.
///
/// Rend `true` quand le fichier est écrit, `false` quand c'est le dialogue
/// d'impression du système qui s'est ouvert à la place (hors Windows) : la
/// page ne dit alors pas « exporté », elle n'en sait rien.
///
/// ASYNC, et pas par goût : une commande synchrone tourne sur le fil
/// principal, celui-là même où `with_webview` envoie l'impression. Attendre la
/// fin de l'impression depuis lui, c'est s'attendre soi-même — l'app gèlerait.
#[tauri::command]
pub async fn imprimer_passage(
    fenetre: tauri::WebviewWindow,
    chemin: String,
) -> Result<bool, String> {
    imprimer(&fenetre, chemin).await
}

#[cfg(windows)]
async fn imprimer(fenetre: &tauri::WebviewWindow, chemin: String) -> Result<bool, String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_2, ICoreWebView2_7,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    fenetre
        .with_webview(move |vue| unsafe {
            let lancer = || -> windows::core::Result<()> {
                let coeur = vue.controller().CoreWebView2()?;
                // Les réglages par défaut sont ceux d'une imprimante
                // américaine : format Letter, en-tête avec l'URL et la date.
                // Un texte qu'on envoie se lit sur une feuille A4, nue.
                let env = coeur.cast::<ICoreWebView2_2>()?.Environment()?;
                let reglages = env.cast::<ICoreWebView2Environment6>()?.CreatePrintSettings()?;
                reglages.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                reglages.SetPageWidth(8.27)?;
                reglages.SetPageHeight(11.69)?;
                // Les marges sont celles de la feuille (en pouces) ; la page
                // les reprend à l'identique en `@page` pour l'impression
                // système, hors Windows.
                reglages.SetMarginTop(0.95)?;
                reglages.SetMarginBottom(0.95)?;
                reglages.SetMarginLeft(1.0)?;
                reglages.SetMarginRight(1.0)?;
                reglages.SetShouldPrintHeaderAndFooter(false)?;
                reglages.SetShouldPrintBackgrounds(true)?;

                let tx = std::sync::Mutex::new(Some(tx));
                let fini = PrintToPdfCompletedHandler::create(Box::new(move |erreur, reussi| {
                    let issue = match (erreur, reussi) {
                        (Ok(()), true) => Ok(()),
                        (Err(e), _) => Err(e.to_string()),
                        (Ok(()), false) => Err("Le PDF n'a pas pu être écrit.".into()),
                    };
                    if let Some(tx) = tx.lock().ok().and_then(|mut t| t.take()) {
                        let _ = tx.send(issue);
                    }
                    Ok(())
                }));
                coeur
                    .cast::<ICoreWebView2_7>()?
                    .PrintToPdf(&HSTRING::from(chemin.as_str()), &reglages, &fini)
            };
            // Si l'impression n'a même pas pu partir, le gestionnaire ne
            // sonnera jamais : sans ce message, la page attendrait toujours.
            if let Err(e) = lancer() {
                eprintln!("⚠️ PDF : impression non lancée ({e})");
            }
        })
        .map_err(|e| e.to_string())?;

    // Le canal se ferme sans message quand l'impression n'est pas partie :
    // c'est l'échec qu'on rapporte alors.
    match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
        Ok(Ok(issue)) => issue.map(|()| true),
        Ok(Err(_)) => Err("L'impression n'a pas pu démarrer.".into()),
        Err(_) => Err("L'impression ne s'est pas terminée.".into()),
    }
}

/// Ailleurs que sous Windows, pas d'impression silencieuse en PDF : le
/// dialogue du système s'ouvre, et « Enregistrer au format PDF » y est.
#[cfg(not(windows))]
async fn imprimer(fenetre: &tauri::WebviewWindow, _chemin: String) -> Result<bool, String> {
    fenetre.print().map_err(|e| e.to_string())?;
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_un_chemin_accentue() {
        let encode = "C%3A%5CUsers%5Cmoi%5C%C3%89t%C3%A9%20au%20phare.png";
        assert_eq!(
            chemin_a_ecrire(encode).unwrap(),
            std::path::PathBuf::from("C:\\Users\\moi\\Été au phare.png")
        );
    }

    #[test]
    fn accepte_une_image_quelle_que_soit_la_casse() {
        assert!(chemin_a_ecrire("histoire.PNG").is_ok());
    }

    #[test]
    fn refuse_ce_que_la_page_ne_produit_pas() {
        // Le .docx n'en est plus : Rust l'écrit lui-même (`exporter_word`).
        for nom in ["script.exe", "page.html", "sans-extension", "faux.png.bat", "texte.docx"] {
            assert!(chemin_a_ecrire(nom).is_err(), "{nom} aurait dû être refusé");
        }
    }
}
