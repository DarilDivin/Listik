//! La courbe des transitions, calculée comme le fait un navigateur.
//!
//! La page anime avec `cubic-bezier(0.22, 0.9, 0.28, 1)` (Motion, `MORPH_EASE`
//! dans app/quick/page.tsx). Quand c'est la FENÊTRE qui se transforme, c'est
//! Rust qui l'anime : il doit suivre exactement la même courbe, sinon le cadre
//! et ce qu'il contient se décalent en route.

/// Une courbe de Bézier cubique de (0,0) à (1,1), comme `cubic-bezier()` en CSS.
#[derive(Debug, Clone, Copy)]
pub struct Courbe {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
}

/// La courbe des métamorphoses de la barre rapide.
pub const METAMORPHOSE: Courbe = Courbe { x1: 0.22, y1: 0.9, x2: 0.28, y2: 1.0 };

impl Courbe {
    fn coord(t: f64, p1: f64, p2: f64) -> f64 {
        // B(t) = 3(1−t)²t·p1 + 3(1−t)t²·p2 + t³
        let u = 1.0 - t;
        3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t
    }

    fn pente_x(&self, t: f64) -> f64 {
        let u = 1.0 - t;
        3.0 * u * u * self.x1 + 6.0 * u * t * (self.x2 - self.x1) + 3.0 * t * t * (1.0 - self.x2)
    }

    /// L'avancement (0..1) à la fraction de temps `x` (0..1).
    ///
    /// La courbe est donnée en fonction d'un paramètre `t`, pas du temps : il
    /// faut d'abord retrouver le `t` dont l'abscisse vaut `x`. Newton converge
    /// en quatre pas presque partout ; là où la pente s'aplatit, on finit par
    /// dichotomie, qui ne peut pas diverger.
    pub fn valeur(&self, x: f64) -> f64 {
        if x <= 0.0 {
            return 0.0;
        }
        if x >= 1.0 {
            return 1.0;
        }
        let mut t = x;
        for _ in 0..8 {
            let ecart = Self::coord(t, self.x1, self.x2) - x;
            if ecart.abs() < 1e-7 {
                return Self::coord(t, self.y1, self.y2);
            }
            let pente = self.pente_x(t);
            if pente.abs() < 1e-6 {
                break;
            }
            t -= ecart / pente;
        }
        let (mut bas, mut haut) = (0.0, 1.0);
        t = x;
        for _ in 0..40 {
            let cx = Self::coord(t, self.x1, self.x2);
            if (cx - x).abs() < 1e-7 {
                break;
            }
            if cx < x {
                bas = t;
            } else {
                haut = t;
            }
            t = (bas + haut) / 2.0;
        }
        Self::coord(t, self.y1, self.y2)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bornes() {
        assert_eq!(METAMORPHOSE.valeur(0.0), 0.0);
        assert_eq!(METAMORPHOSE.valeur(1.0), 1.0);
    }

    #[test]
    fn monotone_et_rapide_au_depart() {
        let mut avant = 0.0;
        for i in 1..=100 {
            let v = METAMORPHOSE.valeur(i as f64 / 100.0);
            assert!(v >= avant - 1e-9, "la courbe recule en {i}");
            avant = v;
        }
        // Une décélération : à mi-temps, on a déjà fait l'essentiel du chemin.
        assert!(METAMORPHOSE.valeur(0.5) > 0.85);
    }

    #[test]
    fn lineaire() {
        let l = Courbe { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
        for i in 0..=10 {
            let x = i as f64 / 10.0;
            assert!((l.valeur(x) - x).abs() < 1e-5);
        }
    }
}
