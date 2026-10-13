//! Un passage du journal en document Word (.docx).
//!
//! Le passage arrive de la page déjà lu en BLOCS (`features/journal/passage.ts`)
//! — la même forme qui donne le texte copié, le PDF et l'image. Rust n'a rien
//! à réanalyser : il pose chaque bloc dans un paragraphe Word.
//!
//! Écrit en Rust plutôt que dans la page : la bibliothèque JavaScript `docx`
//! ne s'évaluait jamais sous le serveur de développement (la page restait
//! suspendue, sans erreur), et un export qu'on ne peut pas essayer ne se
//! vérifie pas. Ici, il s'écrit et se relit dans un test.

use std::collections::HashMap;

use docx_rs::{
    AbstractNumbering, AlignmentType, BreakType, Docx, Hyperlink, HyperlinkType, IndentLevel,
    Level, LevelJc, LevelOverride, LevelText, LineSpacing, NumberFormat, Numbering, NumberingId,
    PageMargin, Paragraph, Pic, Run, RunFonts, SpecialIndentType, Start, Style, StyleType,
};
use serde::Deserialize;

/// Miroir de `Texte` dans `passage.ts`.
#[derive(Debug, Deserialize)]
pub struct Texte {
    pub texte: String,
    #[serde(default)]
    pub gras: bool,
    #[serde(default)]
    pub italique: bool,
    #[serde(default)]
    pub barre: bool,
    #[serde(default)]
    pub souligne: bool,
    #[serde(default)]
    pub code: bool,
    pub lien: Option<String>,
}

/// Miroir de `Fragment` : un retour à la ligne, ou du texte.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Fragment {
    // Le champ ne sert qu'à RECONNAÎTRE la variante : sa valeur est toujours vraie.
    #[allow(dead_code)]
    Saut { saut: bool },
    Texte(Texte),
}

#[derive(Debug, Deserialize)]
pub struct Liste {
    pub ordonnee: bool,
    pub items: Vec<ItemListe>,
}

#[derive(Debug, Deserialize)]
pub struct ItemListe {
    pub fragments: Vec<Fragment>,
    #[serde(rename = "sousListes")]
    pub sous_listes: Vec<Liste>,
}

/// Miroir de `Bloc`, distingué par son champ `type`.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Bloc {
    Paragraphe { fragments: Vec<Fragment> },
    Titre { niveau: u8, fragments: Vec<Fragment> },
    Citation { fragments: Vec<Fragment> },
    Liste(Liste),
    Code { texte: String },
    Piece {
        #[serde(rename = "pieceId")]
        piece_id: String,
        legende: String,
    },
}

/// Une image prête pour Word : du PNG, et sa taille en pixels.
pub struct ImageWord {
    pub png: Vec<u8>,
    pub largeur: u32,
    pub hauteur: u32,
}

/// Décode une image jointe et la ré-encode en PNG — le seul format que
/// `docx-rs` sait poser. `None` pour un format illisible (AVIF, fichier
/// abîmé) : l'image manque au document, le reste du passage part quand même.
pub fn image_pour_word(octets: &[u8]) -> Option<ImageWord> {
    let img = image::load_from_memory(octets).ok()?;
    let mut png = std::io::Cursor::new(Vec::new());
    img.write_to(&mut png, image::ImageFormat::Png).ok()?;
    Some(ImageWord {
        png: png.into_inner(),
        largeur: img.width(),
        hauteur: img.height(),
    })
}

/// La police du texte : une serif de lecture, présente partout où Word l'est.
const POLICE: &str = "Georgia";
/// Largeur utile d'une page A4 aux marges choisies, en pixels à 96 ppp.
const LARGEUR_UTILE: u32 = 600;
/// Une liste à puces partage UNE numérotation ; les listes ordonnées ont
/// chacune la leur (voir `Composition::liste`).
const PUCES: usize = 1;
const NUMEROS: usize = 2;
const PROFONDEUR: usize = 5;

fn police(nom: &str) -> RunFonts {
    RunFonts::new().ascii(nom).hi_ansi(nom).cs(nom).east_asia(nom)
}

fn run(t: &Texte) -> Run {
    let mut r = Run::new().add_text(t.texte.clone());
    if t.gras {
        r = r.bold();
    }
    if t.italique {
        r = r.italic();
    }
    if t.barre {
        r = r.strike();
    }
    if t.souligne {
        r = r.underline("single");
    }
    if t.code {
        r = r.fonts(police("Consolas"));
    }
    r
}

fn en_ligne(mut p: Paragraph, fragments: &[Fragment]) -> Paragraph {
    for f in fragments {
        p = match f {
            Fragment::Saut { .. } => p.add_run(Run::new().add_break(BreakType::TextWrapping)),
            Fragment::Texte(t) => match &t.lien {
                Some(url) => p.add_hyperlink(
                    Hyperlink::new(url, HyperlinkType::External).add_run(run(t).style("Lien")),
                ),
                None => p.add_run(run(t)),
            },
        };
    }
    p
}

struct Composition<'a> {
    docx: Docx,
    images: &'a HashMap<String, ImageWord>,
    /// Prochain identifiant de numérotation libre.
    numero: usize,
}

impl Composition<'_> {
    fn ajouter(&mut self, p: Paragraph) {
        let docx = std::mem::take(&mut self.docx);
        self.docx = docx.add_paragraph(p);
    }

    /// Une liste ordonnée a sa PROPRE instance de numérotation, remise à 1 :
    /// deux instances qui partagent la même définition se suivraient sinon,
    /// et une liste toute neuve commencerait à « 4. ».
    fn liste(&mut self, l: &Liste, niveau: usize, instance: usize) {
        for item in &l.items {
            let p = en_ligne(Paragraph::new(), &item.fragments)
                .numbering(NumberingId::new(instance), IndentLevel::new(niveau.min(PROFONDEUR - 1)));
            self.ajouter(p);
            for s in &item.sous_listes {
                let id = if s.ordonnee { self.nouvelle_numerotation() } else { PUCES };
                self.liste(s, niveau + 1, id);
            }
        }
    }

    fn nouvelle_numerotation(&mut self) -> usize {
        let id = self.numero;
        self.numero += 1;
        let mut n = Numbering::new(id, NUMEROS);
        for niveau in 0..PROFONDEUR {
            n = n.add_override(LevelOverride::new(niveau).start(1));
        }
        let docx = std::mem::take(&mut self.docx);
        self.docx = docx.add_numbering(n);
        id
    }

    fn bloc(&mut self, b: &Bloc) {
        match b {
            Bloc::Paragraphe { fragments } => self.ajouter(en_ligne(Paragraph::new(), fragments)),
            Bloc::Titre { niveau, fragments } => {
                let style = format!("Titre{}", (*niveau).clamp(1, 3));
                self.ajouter(en_ligne(Paragraph::new().style(&style), fragments));
            }
            Bloc::Citation { fragments } => {
                self.ajouter(en_ligne(Paragraph::new().style("Citation"), fragments))
            }
            Bloc::Liste(l) => {
                let id = if l.ordonnee { self.nouvelle_numerotation() } else { PUCES };
                self.liste(l, 0, id);
            }
            Bloc::Code { texte } => {
                let mut p = Paragraph::new();
                for (i, ligne) in texte.split('\n').enumerate() {
                    let mut r = Run::new().fonts(police("Consolas"));
                    if i > 0 {
                        r = r.add_break(BreakType::TextWrapping);
                    }
                    p = p.add_run(r.add_text(ligne));
                }
                self.ajouter(p);
            }
            Bloc::Piece { piece_id, legende } => {
                let Some(img) = self.images.get(piece_id) else {
                    return;
                };
                // Jamais plus large que la page ; jamais agrandie au-delà de
                // sa taille. Word compte en EMU : 9 525 par pixel.
                let echelle = (LARGEUR_UTILE as f64 / img.largeur as f64).min(1.0);
                let w = (img.largeur as f64 * echelle).round() as u32;
                let h = (img.hauteur as f64 * echelle).round() as u32;
                let pic = Pic::new_with_dimensions(img.png.clone(), img.largeur, img.hauteur)
                    .size(w * 9525, h * 9525);
                self.ajouter(
                    Paragraph::new()
                        .align(AlignmentType::Center)
                        .add_run(Run::new().add_image(pic)),
                );
                if !legende.trim().is_empty() {
                    self.ajouter(
                        Paragraph::new()
                            .style("Legende")
                            .add_run(Run::new().add_text(legende.clone())),
                    );
                }
            }
        }
    }
}

fn niveaux(format: &str, texte: impl Fn(usize) -> String) -> AbstractNumbering {
    let id = if format == "bullet" { PUCES } else { NUMEROS };
    let mut a = AbstractNumbering::new(id);
    for n in 0..PROFONDEUR {
        a = a.add_level(
            Level::new(
                n,
                Start::new(1),
                NumberFormat::new(format),
                LevelText::new(texte(n)),
                LevelJc::new("left"),
            )
            .indent(
                Some(720 * (n as i32 + 1)),
                Some(SpecialIndentType::Hanging(360)),
                None,
                None,
            ),
        );
    }
    a
}

/// Le passage en .docx : les octets du fichier, prêts à écrire.
pub fn document_word(
    blocs: &[Bloc],
    images: &HashMap<String, ImageWord>,
) -> Result<Vec<u8>, String> {
    let titre = |id: &str, nom: &str, taille: usize, avant: u32, apres: u32| {
        Style::new(id, StyleType::Paragraph)
            .name(nom)
            .based_on("Normal")
            .next("Normal")
            .bold()
            .size(taille)
            .fonts(police(POLICE))
            .line_spacing(LineSpacing::new().before(avant).after(apres))
    };

    let docx = Docx::new()
        // A4, marges de 2,5 cm.
        .page_size(11906, 16838)
        .page_margin(PageMargin::new().top(1418).bottom(1418).left(1418).right(1418))
        .default_fonts(police(POLICE))
        .default_size(24)
        // Interligne 1,4 et un peu d'air entre les paragraphes : la page d'un
        // texte qu'on lit, pas d'un formulaire.
        .default_line_spacing(LineSpacing::new().line(336).after(160))
        .add_style(titre("Titre1", "heading 1", 36, 240, 240).outline_lvl(0))
        .add_style(titre("Titre2", "heading 2", 30, 240, 160).outline_lvl(1))
        .add_style(titre("Titre3", "heading 3", 26, 200, 120).outline_lvl(2))
        .add_style(
            Style::new("Citation", StyleType::Paragraph)
                .name("Quote")
                .based_on("Normal")
                .italic()
                .color("555555")
                .indent(Some(567), None, None, None),
        )
        .add_style(
            Style::new("Legende", StyleType::Paragraph)
                .name("Caption")
                .based_on("Normal")
                .italic()
                .size(20)
                .color("666666")
                .align(AlignmentType::Center),
        )
        .add_style(
            Style::new("Lien", StyleType::Character)
                .name("Hyperlink")
                .color("1F4E79")
                .underline("single"),
        )
        .add_abstract_numbering(niveaux("bullet", |n| ["•", "◦", "▪"][n % 3].to_string()))
        .add_abstract_numbering(niveaux("decimal", |n| format!("%{}.", n + 1)))
        .add_numbering(Numbering::new(PUCES, PUCES));

    let mut c = Composition {
        docx,
        images,
        numero: NUMEROS + 1,
    };
    for b in blocs {
        c.bloc(b);
    }

    let mut octets = std::io::Cursor::new(Vec::new());
    c.docx.build().pack(&mut octets).map_err(|e| e.to_string())?;
    Ok(octets.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    /// Le XML du corps d'un .docx — ce que Word lira.
    fn corps(docx: &[u8]) -> String {
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
        let mut xml = String::new();
        zip.by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        xml
    }

    fn fichiers(docx: &[u8]) -> Vec<String> {
        let zip = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
        zip.file_names().map(String::from).collect()
    }

    /// Des blocs tels que la page les envoie.
    fn blocs(json: &str) -> Vec<Bloc> {
        serde_json::from_str(json).unwrap()
    }

    fn png(l: u32, h: u32) -> Vec<u8> {
        let mut o = std::io::Cursor::new(Vec::new());
        image::RgbImage::new(l, h)
            .write_to(&mut o, image::ImageFormat::Png)
            .unwrap();
        o.into_inner()
    }

    const HISTOIRE: &str = r#"[
        {"type":"titre","niveau":2,"fragments":[{"texte":"Le phare"}]},
        {"type":"paragraphe","fragments":[
            {"texte":"Il faisait "},{"texte":"nuit","italique":true},
            {"texte":", vent < 40 & "},{"texte":"fort","gras":true},{"saut":true},
            {"texte":"froid","barre":true}]},
        {"type":"citation","fragments":[{"texte":"Personne ne vient."}]},
        {"type":"liste","ordonnee":true,"items":[
            {"fragments":[{"texte":"un"}],"sousListes":[]},
            {"fragments":[{"texte":"deux"}],"sousListes":[
                {"type":"liste","ordonnee":false,"items":[{"fragments":[{"texte":"puce"}],"sousListes":[]}]}]}]},
        {"type":"liste","ordonnee":true,"items":[{"fragments":[{"texte":"encore un"}],"sousListes":[]}]},
        {"type":"paragraphe","fragments":[{"texte":"site","lien":"https://exemple.fr"}]},
        {"type":"piece","pieceId":"img-1","legende":"La mer"},
        {"type":"piece","pieceId":"absente","legende":"Perdue"}
    ]"#;

    #[test]
    fn pose_chaque_bloc_dans_word() {
        let mut images = HashMap::new();
        images.insert("img-1".to_string(), image_pour_word(&png(1200, 600)).unwrap());
        let docx = document_word(&blocs(HISTOIRE), &images).unwrap();
        let xml = corps(&docx);

        assert!(xml.contains(r#"<w:pStyle w:val="Titre2" />"#), "titre");
        assert!(xml.contains(r#"<w:pStyle w:val="Citation" />"#), "citation");
        assert!(xml.contains("<w:i />"), "italique");
        assert!(xml.contains("<w:b />"), "gras");
        assert!(xml.contains("<w:strike />"), "barré");
        assert!(xml.contains(r#"<w:br w:type="textWrapping" />"#), "retour à la ligne");
        // Le texte est échappé, pas injecté dans le XML.
        assert!(xml.contains("vent &lt; 40 &amp; "), "échappement");
        assert!(xml.contains("<w:hyperlink"), "lien");
        // Une image : posée, ramenée à la largeur utile (600 px en EMU).
        assert!(fichiers(&docx).iter().any(|f| f.starts_with("word/media/")), "image");
        assert!(xml.contains(&format!("cx=\"{}\"", 600 * 9525)), "taille de l'image");
        assert!(xml.contains("La mer"), "légende");
        // Une pièce sans image disparaît, légende comprise.
        assert!(!xml.contains("Perdue"));
    }

    #[test]
    fn chaque_liste_ordonnee_repart_de_un() {
        let docx = document_word(&blocs(HISTOIRE), &HashMap::new()).unwrap();
        let xml = corps(&docx);
        // Deux listes ordonnées : deux numérotations distinctes, plus celle
        // des puces (la sous-liste).
        for id in [PUCES, NUMEROS + 1, NUMEROS + 2] {
            assert!(
                xml.contains(&format!(r#"<w:numId w:val="{id}" />"#)),
                "numérotation {id} absente"
            );
        }
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&docx[..])).unwrap();
        let mut num = String::new();
        zip.by_name("word/numbering.xml").unwrap().read_to_string(&mut num).unwrap();
        assert!(num.contains("w:startOverride"), "remise à 1");
    }

    #[test]
    fn refuse_poliment_une_image_illisible() {
        assert!(image_pour_word(b"pas une image").is_none());
        let i = image_pour_word(&png(40, 20)).unwrap();
        assert_eq!((i.largeur, i.hauteur), (40, 20));
    }
}
