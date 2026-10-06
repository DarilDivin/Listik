//! Garde de navigation de toutes les fenêtres.
//!
//! Une fenêtre Tauri est un navigateur sans barre d'adresse ni bouton retour :
//! un clic sur un lien externe (dans une réponse de l'Assistant, dans le
//! Journal) remplaçait l'app entière par la page web, sans moyen d'en revenir
//! autrement qu'en relançant. Ce garde ne laisse naviguer une fenêtre que vers
//! l'app elle-même, et confie le reste au navigateur du système.

use tauri::{plugin::TauriPlugin, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// L'app elle-même : `tauri://localhost` (Mac), `http(s)://tauri.localhost`
/// (Windows), et le serveur de dev Next en debug.
fn est_l_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "ipc" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("tauri.localhost" | "asset.localhost" | "ipc.localhost")
        ) || (cfg!(debug_assertions) && url.host_str() == Some("localhost")),
        _ => false,
    }
}

/// Ce qu'on accepte de confier au système : le web et les courriels.
fn ouvrable_dehors(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

pub fn garde<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("garde-navigation")
        .on_navigation(|webview, url| {
            if est_l_app(url) {
                return true;
            }
            if ouvrable_dehors(url) {
                if let Err(e) = webview.opener().open_url(url.as_str(), None::<&str>) {
                    eprintln!("⚠️ Ouverture de {url} impossible : {e}");
                }
            }
            false
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::{est_l_app, ouvrable_dehors};
    use tauri::Url;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn seule_l_app_reste_dans_la_fenetre() {
        assert!(est_l_app(&url("tauri://localhost/journal")));
        assert!(est_l_app(&url("http://tauri.localhost/settings/")));
        assert!(est_l_app(&url("http://asset.localhost/C%3A/pieces/x.png")));
        assert!(!est_l_app(&url("https://example.com/")));
        assert!(!est_l_app(&url("http://tauri.localhost.evil.com/")));
        assert!(!est_l_app(&url("file:///C:/Windows/win.ini")));
    }

    #[test]
    fn seuls_le_web_et_les_courriels_partent_dehors() {
        assert!(ouvrable_dehors(&url("https://example.com/")));
        assert!(ouvrable_dehors(&url("mailto:a@b.fr")));
        assert!(!ouvrable_dehors(&url("file:///C:/Windows/System32/calc.exe")));
        assert!(!ouvrable_dehors(&url("ms-settings:privacy")));
    }
}
