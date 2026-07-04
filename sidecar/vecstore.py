"""Base vectorielle du sidecar : embeddings locaux (fastembed) + recherche
par similarité (sqlite-vec). Base séparée de listik.db (propriété de Rust) —
le sidecar est seul propriétaire de listik_vec.db.
"""

import sqlite3
from pathlib import Path

import sqlite_vec
from fastembed import TextEmbedding

DB_PATH = Path(__file__).parent / "listik_vec.db"
# Modèle multilingue (français inclus), 384 dims, entraîné pour la similarité
# de sens ("paraphrase"). Pas de convention de préfixe query/passage à gérer
# ici (spécifique aux modèles E5, non utilisée par celui-ci).
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM = 384

# Chargé au premier appel seulement (pas au démarrage) : le modèle prend
# quelques secondes à charger (et se télécharge au tout premier lancement),
# ça ne doit pas retarder la réponse de /health.
_model: TextEmbedding | None = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model


def embed_text(text: str) -> list[float]:
    return list(_get_model().embed([text]))[0].tolist()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS items ("
        "id TEXT PRIMARY KEY, type TEXT NOT NULL, text TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0("
        f"embedding float[{EMBEDDING_DIM}] distance_metric=cosine)"
    )
    return conn


def upsert_item(item_id: str, item_type: str, text: str) -> None:
    """Indexe (ou ré-indexe) une tâche/note : upsert des métadonnées + de l'embedding."""
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO items(id, type, text) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET type = excluded.type, text = excluded.text",
            (item_id, item_type, text),
        )
        row = conn.execute("SELECT rowid FROM items WHERE id = ?", (item_id,)).fetchone()
        rowid = row[0]

        embedding = embed_text(text)
        # vec0 n'a pas d'UPSERT : on retire l'ancien vecteur avant d'insérer le nouveau.
        conn.execute("DELETE FROM vec_items WHERE rowid = ?", (rowid,))
        conn.execute(
            "INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)",
            (rowid, sqlite_vec.serialize_float32(embedding)),
        )
        conn.commit()
    finally:
        conn.close()


def search(query: str, k: int = 5) -> list[dict]:
    """k plus proches voisins de `query` (tâches et notes confondues)."""
    conn = _connect()
    try:
        embedding = embed_text(query)
        # La contrainte k doit être visible directement sur vec_items (littérale,
        # k validé par Pydantic en amont) : isolée dans une sous-requête, sinon
        # le JOIN empêche sqlite-vec de reconnaître la requête KNN.
        rows = conn.execute(
            f"""
            SELECT items.id, items.type, items.text, v.distance
            FROM (
                SELECT rowid, distance
                FROM vec_items
                WHERE embedding MATCH ? AND k = {int(k)}
            ) AS v
            JOIN items ON items.rowid = v.rowid
            ORDER BY v.distance
            """,
            (sqlite_vec.serialize_float32(embedding),),
        ).fetchall()
        return [{"id": r[0], "type": r[1], "text": r[2], "score": r[3]} for r in rows]
    finally:
        conn.close()


def remove_item(item_id: str) -> None:
    """Retire une tâche/note de l'index (appelé quand elle est supprimée)."""
    conn = _connect()
    try:
        row = conn.execute("SELECT rowid FROM items WHERE id = ?", (item_id,)).fetchone()
        if row is not None:
            conn.execute("DELETE FROM vec_items WHERE rowid = ?", (row[0],))
            conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
            conn.commit()
    finally:
        conn.close()
