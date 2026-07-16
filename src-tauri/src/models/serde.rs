use serde::{Deserialize, Deserializer};

/// Désérialise un champ `Option<Option<T>>` en distinguant l'absence du champ
/// (`None`, ne pas toucher) d'un `null` explicite (`Some(None)`, mettre à NULL).
/// À combiner avec `#[serde(default)]`. Partagé par les modèles de mise à jour.
pub(crate) fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}
