-- Réglages applicatifs sous forme clé/valeur (texte). Stocke notamment le
-- digest quotidien : daily_digest_enabled ("0"/"1"), daily_digest_time ("HH:MM"),
-- daily_digest_last_sent ("YYYY-MM-DD", interne — évite de notifier deux fois/jour).
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
