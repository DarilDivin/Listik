//! Ce que la webview a le droit de demander à la machine.
//!
//! WebView2 ne tranche pas seul : il lève un événement `PermissionRequested`
//! et attend que l'application réponde. Tant que personne n'écoute, la
//! promesse `getUserMedia` du webview ne se résout JAMAIS — pas de refus, pas
//! de dialogue, juste un appel suspendu. C'est le mur contre lequel butaient
//! les notes vocales.
//!
//! On répond donc, et on répond étroitement : le MICRO, sur notre propre
//! origine, et rien d'autre. Le drapeau `--use-fake-ui-for-media-stream`
//! aurait tenu en une ligne, mais il accorde en silence le micro ET la caméra
//! à tout ce que la webview charge — un journal qui peut ouvrir la caméra
//! sans rien demander n'a pas sa place ici.

#[cfg(windows)]
pub fn autoriser_le_micro(fenetre: &tauri::WebviewWindow) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PermissionRequestedEventArgs3, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DENY,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows::core::{Interface, PWSTR};

    /// L'origine d'une URL — « http://localhost:3000/journal/ » devient
    /// « http://localhost:3000 ». Comparer les URL entières refuserait la
    /// demande dès qu'on change de page.
    fn origine(url: &str) -> String {
        match url.match_indices('/').nth(2) {
            Some((i, _)) => url[..i].to_string(),
            None => url.to_string(),
        }
    }

    /// Lit une chaîne rendue par COM, et libère sa mémoire.
    unsafe fn lire(brut: PWSTR) -> String {
        if brut.is_null() {
            return String::new();
        }
        let texte = unsafe { brut.to_string() }.unwrap_or_default();
        unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(brut.0 as *const _)) };
        texte
    }

    fenetre
        .with_webview(|vue| unsafe {
            let coeur = match vue.controller().CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("⚠️ Permissions : webview inaccessible ({e})");
                    return;
                }
            };

            let mut jeton = Default::default();
            let pose = coeur.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|vue, args| {
                    let (Some(vue), Some(args)) = (vue, args) else {
                        return Ok(());
                    };

                    let mut nature = Default::default();
                    args.PermissionKind(&mut nature)?;

                    let mut uri = PWSTR::null();
                    args.Uri(&mut uri)?;
                    let demandeur = origine(&lire(uri));

                    // Notre origine se lit MAINTENANT, pas au montage : le
                    // gestionnaire est posé pendant `setup`, quand la webview
                    // n'a encore rien chargé — sa source serait vide, et tout
                    // serait refusé. Elle se lit ici pour la même raison
                    // qu'elle n'est pas codée en dur : le serveur Next en
                    // développement, le protocole de Tauri dans l'app livrée.
                    let mut source = PWSTR::null();
                    vue.Source(&mut source)?;
                    let notre = origine(&lire(source));

                    // Le micro, chez nous, et rien d'autre. Un refus EXPLICITE
                    // vaut mieux qu'un silence : sans état posé, l'appel
                    // resterait suspendu comme avant.
                    let accorde = nature == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                        && !notre.is_empty()
                        && demandeur == notre;
                    args.SetState(if accorde {
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW
                    } else {
                        COREWEBVIEW2_PERMISSION_STATE_DENY
                    })?;

                    // Ne RIEN mémoriser dans le profil. WebView2 garde sinon
                    // la réponse par origine et cesse de lever l'événement :
                    // un refus prononcé une fois — par une version fautive,
                    // par exemple — devient définitif, et le gestionnaire
                    // corrigé n'est plus jamais consulté. La décision se
                    // reprend donc à chaque demande ; elle est de toute façon
                    // déterministe.
                    if let Ok(args2) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
                        let _ = args2.SetSavesInProfile(false);
                    }
                    Ok(())
                })),
                &mut jeton,
            );
            if let Err(e) = pose {
                eprintln!("⚠️ Permissions : gestionnaire non posé ({e})");
            }
        })
        .map_err(|e| e.to_string())
}

/// Ailleurs que sous Windows, rien à faire : le mur est propre à WebView2.
#[cfg(not(windows))]
pub fn autoriser_le_micro(_fenetre: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
