# Carnet d'apprentissage — Listik IA

Ce carnet accompagne la Phase D du [ROADMAP.md](./ROADMAP.md) : transformer Listik en assistant
intelligent. Le but n'est pas seulement d'avoir une fonctionnalité qui marche, mais de comprendre
chaque brique — c'est un support d'apprentissage des compétences IA/Data (NLP/LLM, RAG, pipeline
de données, agent/function-calling).

Chaque étape suit le même format : **concept** (pourquoi, en langage simple) → **code** → **explication du code**.

---

## Phase D0 — Sidecar Python (fondation)

### Concept

Un **sidecar** est un processus auxiliaire qui tourne à côté de l'application principale — comme
un side-car sur une moto : il avance avec elle, mais c'est un véhicule à part.

- **Rust reste le chef d'orchestre** : il possède la base SQLite, gère la fenêtre Tauri, et décide de tout.
- **Python tourne en parallèle**, en tant que processus séparé, et s'occupe *uniquement* de l'IA
  (appeler un LLM, calculer des embeddings, faire de la recherche sémantique).
- Les deux communiquent en **HTTP** : Python expose un petit serveur web local (comme une URL
  `localhost:xxxx`), et Rust lui envoie des requêtes.

**Pourquoi pas tout en Rust ?** L'écosystème IA (SDK LLM, embeddings, RAG) est très majoritairement
en Python — et ce sont ces compétences à apprendre. On isole cette responsabilité dans un service
séparé plutôt que de la réinventer en Rust.

**Pourquoi FastAPI ?** Framework Python léger pour exposer des routes HTTP — l'équivalent
d'Express.js (Node) ou d'Actix (Rust). Première route : `GET /health`, qui répond juste "OK", pour
vérifier que le processus Python est démarré et joignable avant d'y brancher de l'intelligence.

**Ce que Rust devra faire (côté `sidecar.rs`) :**
1. Lancer ("spawn") le processus Python au démarrage de l'app — comme `python main.py` en terminal,
   mais déclenché automatiquement par Tauri.
2. Vérifier périodiquement que ce processus répond ("healthcheck").
3. Le tuer explicitement à la fermeture de l'app — sinon il continue de tourner en arrière-plan
   (processus "zombie").

### Code — `sidecar/main.py`

```python
import argparse

import uvicorn
from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8420)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
```

### Explication du code

- `app = FastAPI()` : crée l'objet application, celui auquel on accroche toutes les routes.
- `@app.get("/health")` est un **décorateur** : il dit à FastAPI "quand une requête HTTP GET arrive
  sur `/health`, exécute la fonction juste en dessous". Le dictionnaire retourné est converti
  automatiquement en JSON → réponse `{"status": "ok"}`.
- Le port est un argument (`--port`), pas codé en dur, pour que Rust puisse le choisir au lancement
  (utile si le port par défaut est déjà pris sur la machine).
- **FastAPI décrit les routes, mais ne sait pas écouter le réseau** : c'est **Uvicorn** qui fait
  tourner le serveur concrètement. `host="127.0.0.1"` = accessible uniquement depuis cette machine
  (pas exposé sur le réseau), cohérent avec le fait que seul Rust doit lui parler.

**Test isolé (avant toute intégration Rust)** :
```bash
cd sidecar
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
./.venv/Scripts/python.exe main.py --port 8420
curl http://127.0.0.1:8420/health   # → {"status":"ok"}
```
✅ Validé le 2026-07-02.

---

## Piloter le sidecar depuis Rust

### Concept

Trois responsabilités distinctes, côté Rust :
1. **Lancer le process** avec `tokio::process::Command` (version async de `std::process::Command`) —
   comme taper `python main.py --port 8420` en terminal, mais déclenché par le code Rust. On garde
   une référence (`Child`) pour pouvoir le tuer plus tard.
2. **Attendre qu'il soit prêt** : démarrer un serveur web prend quelques centaines de ms. Rust
   **sonde** `/health` en boucle (toutes les 300ms, jusqu'à 10s) plutôt que de supposer une
   disponibilité instantanée.
3. **Le tuer à la fermeture** : Tauri émet `RunEvent::Exit` quand l'app se ferme — on y accroche le
   kill du process Python, sinon il resterait actif en arrière-plan indéfiniment ("zombie").

La référence au process est stockée dans l'**état partagé** de l'app (`app.manage(...)`), exactement
comme le pool SQLite (`AppState`) — même mécanisme Tauri, juste une donnée différente.

### Code — `src-tauri/src/sidecar.rs`

```rust
pub struct SidecarState(pub Mutex<Option<Child>>);

fn sidecar_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../sidecar")
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match start_process() {
            Ok(child) => {
                if let Some(state) = app.try_state::<SidecarState>() {
                    *state.0.lock().unwrap() = Some(child);
                }
                wait_until_ready().await;
            }
            Err(e) => eprintln!("⚠️ Échec du lancement du sidecar Python: {e}"),
        }
    });
}

fn start_process() -> std::io::Result<Child> {
    let dir = sidecar_dir();
    Command::new(dir.join(VENV_PYTHON))
        .arg(dir.join("main.py"))
        .arg("--port").arg(SIDECAR_PORT.to_string())
        .kill_on_drop(true)
        .spawn()
}

async fn wait_until_ready() {
    let url = format!("http://127.0.0.1:{SIDECAR_PORT}/health");
    for _ in 0..33 {
        if reqwest::get(&url).await.is_ok_and(|r| r.status().is_success()) {
            println!("✅ Sidecar Python prêt sur le port {SIDECAR_PORT}");
            return;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    eprintln!("⚠️ Sidecar Python: pas de réponse après 10s");
}

pub fn kill(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(mut child) = state.0.lock().unwrap().take() {
            let _ = child.start_kill();
        }
    }
}
```

### Explication du code

- **`SidecarState(Mutex<Option<Child>>)`** : une "boîte" partagée contenant soit rien (`None`,
  avant lancement), soit le process Python (`Some(child)`). Le `Mutex` garantit qu'un seul bout de
  code async y touche à la fois (évite les accès concurrents dangereux).
- **`env!("CARGO_MANIFEST_DIR")`** est résolu **à la compilation** : chemin absolu du dossier
  `src-tauri`. On remonte d'un cran pour trouver `sidecar/`. Limitation assumée : ne marche qu'en
  dev (code compilé et sources au même endroit). En prod, il faudra un binaire Python packagé
  (PyInstaller + `externalBin` de Tauri) — travail futur, pas oublié.
- **`tauri::async_runtime::spawn`** démarre une tâche async **en parallèle**, sans bloquer le
  démarrage de l'app (la fenêtre s'affiche tout de suite, le sidecar se lance à côté).
- **`Command::new(...).arg(...).spawn()`** = équivalent programmatique de `python main.py --port
  8420` en terminal. `kill_on_drop(true)` est une sécurité Tokio : si la référence est perdue sans
  kill explicite (crash, bug), le process est quand même tué automatiquement.
- **Boucle d'attente** : 33 tentatives × 300ms ≈ 10s max. `reqwest::get` = simple appel HTTP GET
  (équivalent `fetch()` JS / `requests.get()` Python).
- **`kill()`** : `.take()` retire le `Child` de la boîte (le remplace par `None`) et le récupère en
  une opération — impossible de le tuer deux fois par erreur.

Côté câblage (`main.rs`, `commands.rs`) :
- `app.manage(sidecar::SidecarState::empty())` + `sidecar::spawn(app.handle().clone())` au `setup()`.
- `.run(tauri::generate_context!())` devient `.build(...).run(|app_handle, event| { if let
  RunEvent::Exit = event { sidecar::kill(app_handle); } })` pour intercepter la fermeture.
- Commande `ai_ping()` : comme `get_settings`, mais interroge le sidecar via HTTP au lieu de SQLite.

### Test

Démarrage réel de l'app (`pnpm tauri dev`), logs observés :
```
🚀 Application Listik démarrée !
INFO:     Uvicorn running on http://127.0.0.1:8420
INFO:     127.0.0.1:7060 - "GET /health HTTP/1.1" 200 OK
✅ Sidecar Python prêt sur le port 8420
```
Rust a lancé Python, sondé `/health`, reçu `200 OK`, confirmé "prêt" — automatique au démarrage.
`curl http://127.0.0.1:8420/health` confirmé en parallèle. Ping depuis le webview
(`window.__TAURI__.core.invoke('ai_ping')`) à vérifier manuellement dans les DevTools (F12).

✅ **D0 terminé** le 2026-07-02.

---

## Phase D1 — Extraction NLP via LLM (mode Tâche)

### Concept

**Le bug corrigé.** Le parsing local (`detectPriorityFromText`) fait un simple
`text.includes("urgent")`. Donc `"appeler maman demain, pas urgent"` contient "urgent" →
détecté **haute priorité**, alors que c'est l'inverse du sens voulu. Une regex ne comprend pas la
négation ; un LLM bien guidé, oui.

**Ce qui reste local vs ce qui devient IA.** Le parsing regex/`chrono-node` reste pour le
surlignage **instantané** pendant la frappe (appeler un serveur à chaque lettre serait lent et
coûteux). À la **validation** (Entrée/clic), le texte complet part vers le sidecar qui répond avec
sa propre analyse.

**Décision de scope.** Le sidecar renvoie un objet complet — `text`, `note`, `due_date`,
`priority`, `list` (un **structured output**, réponse JSON conforme à un schéma précis) — mais le
frontend n'utilise que le champ **priority** de cette réponse. La date (`chrono-node`) et la liste
(`#tag`) marchent déjà bien et sont pilotées par des contrôles manuels (calendrier, sélecteur) :
les remplacer silencieusement par une réponse IA risquerait d'écraser un choix fait à la main, sans
bénéfice puisqu'il n'y a pas de bug connu là-dessus. Extensible plus tard si besoin.

**Comment on force un JSON valide et fiable :**
1. **Prompt système** : décrit le schéma exact + des exemples ("few-shot") montrant le piège de la
   négation.
2. **Mode JSON** de l'API (`response_format: {"type": "json_object"}`) : garantit une syntaxe JSON
   valide côté serveur LLM.
3. **Pydantic** : valide que le JSON reçu a les bons champs/types. Si le LLM sort une valeur hors
   schéma, ça lève une erreur gérée plutôt que de laisser passer une donnée corrompue.

**Le fournisseur : Groq.** Gratuit, rapide, compatible SDK `openai` (juste `base_url` différent) —
donc basculer vers Mistral ou Ollama local (D5) ne touche presque pas au code.

### Code — `sidecar/main.py` (endpoint `/parse`)

```python
llm = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)

class SmartTaskData(BaseModel):
    text: str
    note: str | None = None
    due_date: str | None = None
    priority: Literal["low", "normal", "high"] = "normal"
    list: str | None = None

@app.post("/parse")
def parse(req: ParseRequest) -> SmartTaskData:
    try:
        completion = llm.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": build_system_prompt()},
                {"role": "user", "content": req.text},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = completion.choices[0].message.content
        return SmartTaskData.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
```

### Explication du code

- `OpenAI(base_url=..., api_key=...)` : le SDK `openai` est devenu un standard d'API que d'autres
  fournisseurs imitent (Groq, Mistral, Ollama...). Changer `base_url` suffit à changer de
  fournisseur — c'est le sens de "hybride" dans le roadmap.
- `Literal["low", "normal", "high"]` : interdit toute valeur hors de ces trois-là. Si le LLM répond
  `"urgente"` (faute), la validation Pydantic échoue au lieu de laisser passer une donnée invalide.
- `response_format={"type": "json_object"}` : garantit une syntaxe JSON valide (pas encore le
  contenu — d'où Pydantic ensuite). `temperature=0` : déterminisme maximal, on veut une extraction
  fiable et répétable, pas de créativité.
- `SmartTaskData.model_validate_json(raw)` : parse **et** valide en une étape. Échec → exception
  attrapée → HTTP 502 propre, jamais un crash silencieux.
- **Le prompt** contient le schéma exact, la règle explicite de négation, et des exemples
  (**few-shot prompting**) : montrer des cas suffit souvent à faire généraliser le bon comportement,
  plus fiable qu'une description abstraite seule.

### Code — Rust (`ai_parse`) et frontend (`useTaskMode.submit`)

Côté Rust, rien de nouveau par rapport à `ai_ping` : `POST` au lieu de `GET`, corps JSON typé
(`ParseRequest`), et un **timeout de 8s** explicite — si Groq est lent/injoignable, la commande
échoue proprement plutôt que de bloquer indéfiniment la création de la tâche.

Côté frontend, le cœur de la décision de scope :
```ts
let finalPriority = priority;
const aiResult = await aiParseTask(value);
if (aiResult && priority === lastDetectedPriority.current) {
  finalPriority = aiResult.priority;
}
```
On n'applique la correction IA que si la priorité actuelle est encore celle auto-détectée par la
regex — c'est-à-dire si l'utilisateur n'a pas choisi une priorité à la main entre-temps. Respecte
l'invariant déjà présent dans le code : la sélection manuelle n'est jamais écrasée. `aiParseTask`
avale ses propres erreurs (retourne `null`) pour que l'indisponibilité du sidecar/LLM n'empêche
jamais de créer une tâche.

### Test

**Isolé** (`curl /parse`, clé Groq configurée dans `sidecar/.env`) :

| Texte | Priorité attendue | Obtenue |
|---|---|---|
| `"appeler maman demain, pas urgent #famille // anniv"` | normal | ✅ normal |
| `"finir le rapport vendredi urgent"` | high | ✅ high |
| `"ranger le garage un jour, pas pressé"` | low | ✅ low |

Piège rencontré pendant le test, sans rapport avec le code : passer `-d '...'` avec un accent
(`é`) directement dans la commande `curl` en shell Windows/git-bash corrompt l'encodage UTF-8 →
`{"detail":"There was an error parsing the body"}`. Corrigé en envoyant le JSON via un fichier
(`--data-binary @fichier.json`). N'affecte pas l'app réelle : le JS (`JSON.stringify`), Rust
(`reqwest`) et Python (FastAPI/Pydantic) gèrent nativement l'UTF-8 de bout en bout.

**Bout-en-bout** (dans l'app, texte `"appeler maman demain, pas urgent #famille // anniv"`) :
tâche créée avec priorité **normale** — confirmé par l'utilisateur le 2026-07-02. Avant D1, ce
même texte aurait donné une priorité haute (bug de négation de la regex).

✅ **D1 terminé** le 2026-07-02.

---

## Phase D2 — RAG : embeddings + recherche sémantique (tâches et notes)

### Concept

**Le problème résolu.** Une recherche par mots-clés (`LIKE %mot%`) ne trouve rien si tu notes
"acheter du lait" puis demandes "qu'est-ce que je dois prendre au magasin ?" — aucun mot commun,
pourtant le sens est lié. Il faut comparer des **sens**, pas des chaînes de caractères.

**Embeddings.** Un embedding est un vecteur (ici 384 nombres) qui représente le *sens* d'un texte :
un modèle entraîné pour ça place des phrases de sens proche à des positions proches dans cet espace,
peu importe les mots exacts. `fastembed` calcule ça **localement** (CPU, pas d'appel réseau, pas de
coût) — contrairement au LLM de D1 qui appelle Groq.

**Similarité cosinus.** Une fois deux textes en vecteurs, on mesure l'angle entre eux : plus il est
petit, plus les textes sont proches en sens. Choix explicite dans le schéma (`distance_metric=cosine`)
: ignore la longueur du vecteur, ne regarde que sa direction.

**Base vectorielle.** SQLite normal ne sait pas chercher "les vecteurs les plus proches" efficacement.
`sqlite-vec` ajoute ce type de colonne/requête à une base SQLite classique — d'où une base séparée,
`listik_vec.db`, propriété du sidecar (Rust garde `listik.db`).

**RAG (Retrieval-Augmented Generation).** Pour répondre à une question, le LLM seul ne connaît pas
tes tâches. Principe en 3 étapes : **Retrieve** (chercher les tâches/notes les plus proches en sens
de la question, via les embeddings) → **Augment** (les insérer dans le prompt comme contexte) →
**Generate** (demander au LLM de répondre *en se basant sur ce contexte*). Même mécanique de prompt
que D1, avec un contexte récupéré dynamiquement au lieu d'écrit à l'avance.

**Chargement paresseux du modèle.** Charger le modèle d'embeddings prend quelques secondes (et
télécharge ~100 Mo au tout premier lancement). Le charger au démarrage du serveur retarderait
`/health` — leçon de D0 réappliquée : chargé seulement au premier appel réel.

**Scope de D2** (volontairement limité par le roadmap) : uniquement les endpoints du sidecar
(`/index`, `/search`, `/ask`), testés à la main via curl, sans toucher Rust/frontend. Le branchement
automatique (indexer une tâche dès qu'elle change) est D3, une étape distincte.

### Code — `sidecar/vecstore.py`

```python
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM = 384

def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT NOT NULL, text TEXT NOT NULL)")
    conn.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(embedding float[{EMBEDDING_DIM}] distance_metric=cosine)")
    return conn

def search(query: str, k: int = 5) -> list[dict]:
    embedding = embed_text(query)
    rows = conn.execute(
        f"""
        SELECT items.id, items.type, items.text, v.distance
        FROM (
            SELECT rowid, distance FROM vec_items
            WHERE embedding MATCH ? AND k = {int(k)}
        ) AS v
        JOIN items ON items.rowid = v.rowid
        ORDER BY v.distance
        """,
        (sqlite_vec.serialize_float32(embedding),),
    ).fetchall()
```

### Explication du code

- `_get_model()` : singleton paresseux (`global _model`), chargé au premier vrai appel, pas à
  l'import du module.
- `.embed([text])` prend une **liste** de textes (traite plusieurs textes d'un coup) et retourne des
  vecteurs numpy ; `.tolist()` convertit en liste Python (sérialisable en JSON).
- `sqlite_vec.load(conn)` : `sqlite-vec` est une **extension native** (code C compilé) chargée dans
  la connexion SQLite — ensuite `CREATE VIRTUAL TABLE ... USING vec0(...)` devient disponible.
- Table `items` (métadonnées : id/type/texte) + table virtuelle `vec_items` (juste le vecteur),
  reliées par le même `rowid` — plus simple que de gérer des colonnes de métadonnées directement
  dans `vec0`.
- `DELETE` puis `INSERT` dans `vec_items` : pas d'upsert direct sur une table `vec0`, on simule.
- `WHERE embedding MATCH ? AND k = {int(k)}` isolé dans une sous-requête **avant** le `JOIN` : c'est
  la correction du bug rencontré (voir Test ci-dessous) — sqlite-vec a besoin de voir la contrainte
  de voisinage directement sur `vec_items`, en valeur littérale.

**`/ask` (RAG)** : `vecstore.search(question, k=5)` récupère le contexte, formaté en texte
(`"- (type) texte"`) et injecté dans le prompt système avec l'instruction explicite de ne pas
inventer si le contexte ne suffit pas — limite les hallucinations. La réponse renvoie aussi
`sources` (les items utilisés), pour une future UI "d'après ta tâche X".

### Bugs rencontrés pendant le test (et corrigés)

1. **Modèle introuvable** : `intfloat/multilingual-e5-small` (prévu au roadmap) n'existe plus dans
   la version installée de `fastembed` — vérifié via `TextEmbedding.list_supported_models()`.
   Remplacé par `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (même dimension 384,
   multilingue). Conséquence : plus besoin des préfixes `"query: "`/`"passage: "`, spécifiques aux
   modèles E5 et absents de celui-ci.
2. **`sqlite3.OperationalError: A LIMIT or 'k = ?' constraint is required on vec0 knn queries`** :
   la contrainte de voisinage doit être visible **directement** sur `vec_items`, en littéral — pas
   après un `JOIN`, pas comme paramètre lié `?`. Corrigé en isolant la recherche KNN dans une
   sous-requête avant la jointure avec `items`.

### Test

3 items indexés (2 tâches + 1 note) via `/index`, puis :
- `/search {"query":"qu'est-ce que je dois prendre au magasin ?","k":3}` → retrouve en premier
  `"acheter du lait et des œufs au supermarché"` (score 0.547, le plus proche), malgré l'absence de
  mot commun ("prendre"/"acheter", "magasin"/"supermarché") — recherche par **sens**, pas par mots.
- `/ask {"question":"qu'est-ce que je dois acheter cette semaine ?"}` → réponse correcte citant la
  tâche lait/œufs, sans inventer d'autres courses absentes du contexte.

✅ **D2 terminé** le 2026-07-02 (sidecar isolé, sans Rust/frontend — prévu pour D3).

---

## Phase D3 — Pipeline d'indexation asynchrone

### Concept

**Le vide à combler.** D2 a donné des endpoints qui marchent, mais rien ne les appelle
automatiquement — il fallait taper `curl` à la main. D3 branche ça : chaque création/modification/
suppression de tâche ou note doit se refléter dans `listik_vec.db`, sans bloquer l'UI.

**Drapeau + tâche de fond, pas d'appel direct.** À la création/modification, on ne va **pas**
appeler le sidecar à cet instant précis (s'il est lent/indisponible, ça bloquerait la saisie). On
pose juste un **drapeau** en base (`needs_embedding = 1`, écriture SQLite locale instantanée). Une
tâche de fond, réveillée toutes les 5s (calquée sur `reminders.rs`), regarde qui a le drapeau levé,
appelle `/index`, et redescend le drapeau à 0 une fois réussi. Si le sidecar ne répond pas, le
drapeau reste levé — retenté au tick suivant, sans code spécial.

**Suppression : cas particulier.** Une tâche supprimée disparaît de `todos` — impossible de lui
poser un drapeau après coup. Les suppressions passent par une table d'attente séparée
(`pending_deindex` : id + type), remplie au moment du `DELETE`, vidée par la tâche de fond via
`/deindex`.

**Idempotence.** Ré-indexer un contenu inchangé ne casse rien (vecteur recalculé identique) — on
peut donc lever le drapeau à *chaque* mutation, sans détecter précisément quels champs ont changé.
Plus simple, sans risque.

### Code

**Migration `0007_vector_sync.sql`** :
```sql
ALTER TABLE todos ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS pending_deindex (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, queued_at TEXT NOT NULL
);
```
`DEFAULT 1` : les lignes déjà existantes héritent aussi du drapeau levé → indexation rétroactive
automatique du stock existant au premier démarrage après la migration.

**`db.rs`** : `needs_embedding = 1` ajouté à chaque `UPDATE` (todos et notes, y compris `toggle`) ;
`queue_deindex()` appelé après chaque `DELETE` (todos et notes).

**`vectorizer.rs`** (nouveau module, calqué sur `reminders.rs`) :
```rust
pub fn spawn_indexer(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(TICK); // 5s
        loop {
            ticker.tick().await;
            if let Err(e) = run_once(&app).await {
                eprintln!("⚠️ Pipeline d'indexation: {e}");
            }
        }
    });
}

async fn run_once(app: &AppHandle) -> Result<(), String> {
    let pool = app.state::<AppState>().pool.clone();

    for (id, _kind) in db::pending_deindex(&pool, BATCH_SIZE).await?... {
        if deindex(&id).await.is_ok() {
            db::clear_pending_deindex(&pool, &id).await?;
        }
        // échec : rien à faire, retenté au prochain tick
    }

    for item in db::todos_needing_embedding(&pool, BATCH_SIZE).await?... {
        if index(&item).await.is_ok() {
            db::mark_todo_embedded(&pool, &item.id).await?;
        }
    }
    // idem pour les notes...
    Ok(())
}
```

**Sidecar** : `/deindex` symétrique à `/index` (retrouve le `rowid` via l'id métier, supprime des
deux tables `vec_items` et `items`).

### Explication du code

- Même architecture que `reminders.rs` : `tauri::async_runtime::spawn` + `tokio::time::interval`
  en boucle infinie — un deuxième "tick" indépendant tourne à côté de celui des rappels.
- **Aucune gestion d'erreur explicite pour "sidecar pas prêt"** : si l'appel échoue, on ne fait
  rien — la ligne reste en attente, et le tick suivant (5s après) réessaiera. Le principe
  "idempotent + périodique" absorbe la panne sans code spécial.
- `r#type` : `type` est un mot-clé réservé en Rust ; le préfixe `r#` ("raw identifier") permet de
  l'utiliser quand même comme nom de champ — nécessaire car le JSON attendu par le sidecar utilise
  la clé `"type"`.
- Texte envoyé à `/index` : `text + "\n" + note` pour une tâche, `title + "\n" + content` pour une
  note — une seule chaîne, cherchée sémantiquement d'un bloc.

### Test

**Indexation rétroactive** (grâce au `DEFAULT 1`) : au premier démarrage après la migration, les
4 tâches/notes déjà existantes ont été automatiquement indexées, sans action de l'utilisateur.
Vérifié directement dans `listik.db` (`needs_embedding` repassé à 0 partout) et `listik_vec.db`
(items présents).

**Test en direct** (création/modification/suppression réelles dans l'app, vérifié en comparant
`listik.db` et `listik_vec.db` avant/après) :

| Action | Élément | Résultat |
|---|---|---|
| Création | tâche "Nouvelle Tâche." | ✅ apparue dans `listik_vec.db` |
| Modification | texte d'une tâche ("...pas urgent" → "...pas très urgent") | ✅ vecteur mis à jour |
| Modification | contenu d'une note | ✅ vecteur mis à jour |
| Suppression | une tâche | ✅ disparue de `listik_vec.db` |
| Suppression | une note (via `invoke('delete_note', ...)` en DevTools) | ✅ disparue de `listik_vec.db` |

`pending_deindex` toujours vide après coup (traité au tick suivant), les deux bases parfaitement
synchronisées à la fin.

✅ **D3 terminé** le 2026-07-04.

---

## Phase D4 — Agent : function calling

### Concept

**L'aboutissement.** Jusqu'ici chaque endpoint faisait UNE chose figée : `/parse` extrait toujours
une tâche, `/ask` répond toujours à une question. Mais quand on écrit librement à un assistant, on
ne lui dit pas quel endpoint appeler — c'est à *lui* de comprendre l'intention et de choisir
l'action. C'est le **function calling**.

**Le mécanisme.** On décrit au LLM une liste d'**outils** (fonctions avec nom, description,
paramètres typés en JSON Schema) : `create_task`, `create_note`, `answer_question`. Le LLM reçoit
la phrase et, au lieu de répondre du texte, renvoie un **tool call** : « appelle `create_task` avec
ces arguments ». Concept clé : **le LLM décide, mais n'exécute pas** — il produit une intention
structurée, notre code exécute.

**Qui exécute quoi (contrainte d'archi).** Rust est seul propriétaire de SQLite. Donc :
- `answer_question` → exécuté dans le sidecar (il a le vector store + le LLM : c'est le RAG de D2).
- `create_task` / `create_note` → le sidecar **décide** et renvoie l'action ; **Rust exécute** en
  réutilisant `db::create` / `db::create_note` (l'agent ne réimplémente rien).

**Flux complet** : Omnibar (mode Question) → commande Rust `ai_agent(text)` → sidecar `/agent` (le
LLM choisit l'outil) → retour à Rust → Rust exécute la mutation si besoin + émet
`todos:changed`/`notes:changed` → réponse affichée dans la section Assistant.

**Scope** : 3 outils = les 3 cas de test du roadmap. `update_task`/`delete_task` (déclarés mais hors
cas de test) nécessitent que l'agent retrouve d'abord *quel* id modifier → boucle agentique
multi-tours, plus complexe. Laissés en extension.

### Code — sidecar `/agent`

```python
AGENT_TOOLS = [
    {"type": "function", "function": {
        "name": "create_task",
        "description": "Créer une tâche quand l'utilisateur demande d'ajouter/créer une tâche...",
        "parameters": {"type": "object", "properties": {...}, "required": ["text"]},
    }},
    # create_note, answer_question...
]

@app.post("/agent")
def agent(req: AgentRequest) -> AgentResponse:
    completion = llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "system", "content": "..."}, {"role": "user", "content": req.text}],
        tools=AGENT_TOOLS, tool_choice="auto", temperature=0,
    )
    calls = completion.choices[0].message.tool_calls or []
    if not calls:                       # aucun outil → repli RAG
        answer, sources = _run_rag(req.text)
        return AgentResponse(tool="answer_question", message=answer, sources=sources)
    call = calls[0]
    args = json.loads(call.function.arguments or "{}")
    if call.function.name == "create_task":
        task = SmartTaskData(**args)
        return AgentResponse(tool="create_task", message=f"Tâche créée : « {task.text} »", task=task)
    # create_note / answer_question...
```

### Explication du code

- `tools=AGENT_TOOLS` + `tool_choice="auto"` : le LLM décide s'il appelle un outil et lequel. Il
  renvoie `tool_calls` (nom + arguments JSON) au lieu de texte.
- **Les descriptions des outils sont tout ce que le LLM voit pour décider** → prompt engineering
  appliqué aux outils (« Créer une tâche quand l'utilisateur demande d'ajouter… »).
- `answer_question` exécuté sur place (`_run_rag`, le RAG de D2 réutilisé) ; `create_task`/
  `create_note` **non exécutés** — arguments validés par Pydantic, renvoyés à Rust.
- Repli `if not calls` : si le LLM ne choisit aucun outil, réponse RAG plutôt qu'un plantage.

### Code — Rust `ai_agent` (l'exécuteur)

```rust
match agent.tool.as_str() {
    "create_task" => { /* CreateTodo → db::create + notify_changed */ }
    "create_note" => { /* CreateNote → db::create_note + notify_notes_changed */ }
    _ => {} // answer_question déjà résolu côté sidecar
}
Ok(AiAgentResponse { message: agent.message, tool: agent.tool, sources: agent.sources })
```
La contrainte d'archi se matérialise ici : le sidecar a *décidé*, Rust *exécute* via le même code
que les commandes normales, et émet l'événement → le planificateur ouvert se rafraîchit tout seul
(synchro de D0/todos). Timeout 20s (tool call + génération RAG possible, plus long qu'un `/parse`).

### Code — frontend

- `AiSource` (ts-rs) garde le champ `type` grâce à `#[serde(rename = "type")]` côté Rust → les deux
  bouts restent alignés automatiquement.
- Omnibar : prop `onSubmitAsk` symétrique à `onSubmitNote`. Après une question, on garde le mode
  `ask` (`setValue("")` sans reset) pour enchaîner.
- Page Assistant (`app/(app)/assistant/page.tsx`) : liste de « tours » (`Turn[]`), indicateur de
  réflexion pendant l'appel, badge « Tâche créée »/« Note enregistrée » selon l'outil, sources
  citées sous les réponses RAG. Markdown rendu via la classe `.note-markdown` existante (pas de
  plugin `prose` dans le projet).

### Test

**Isolé** (`curl /agent`, 3 cas du roadmap) :
- « ajoute appeler le dentiste vendredi » → `create_task` (extrait « appeler le dentiste » + date)
- « qu'est-ce que j'ai cette semaine ? » → `answer_question` (cite les vraies tâches en sources)
- « note : idée d'article sur le RAG » → `create_note` (titre inféré)

**Bout-en-bout dans l'app** (section Assistant) : confirmé par l'utilisateur. Création via l'agent
vérifiée en base — nouvelle tâche apparue *et* déjà indexée par le pipeline D3 (`needs_embedding=0`)
dans la foulée : la chaîne complète agent → Rust → SQLite → vectorizer fonctionne.

✅ **D4 terminé** le 2026-07-04.

Reste : **D5** (bonus) — rendre `LLM_BASE_URL`/`LLM_MODEL` pointables vers Ollama local pour une app
entièrement offline (déjà configurables via `.env`, à valider avec une instance Ollama).

---

## Après D4 — leçon : le seuil de confiance dans une action déclenchée par la recherche

En ajoutant `update_task`/`delete_task` à l'agent (l'IA retrouve la tâche via recherche sémantique
avant d'agir dessus), un incident réel a montré une faille de conception importante.

**Ce qui s'est passé** : `_find_task()` prenait toujours le "meilleur" résultat renvoyé par
`/search`, même quand aucun n'avait vraiment de rapport avec la demande. Demander
*"supprime la tâche des vacances au Japon"* (aucune tâche de ce genre n'existait) a quand même fait
remonter *une* tâche — la moins mauvaise des mauvaises correspondances — et elle a été supprimée
pour de vrai (la fenêtre d'annulation de 5s était déjà passée quand l'erreur a été remarquée).

**Pourquoi ça arrive** : une recherche par similarité **renvoie toujours un classement**, même
quand rien n'est réellement pertinent — elle ne dit jamais "je ne sais pas". La distance entre "le
meilleur des mauvais résultats" et "un vrai résultat" n'est pas nulle : il faut la mesurer et fixer
une limite explicite en dessous de laquelle on refuse d'agir.

**Le correctif** : un seuil sur la distance cosinus (`MAX_TASK_MATCH_DISTANCE = 0.7`), calibré en
comparant des vrais cas (score ~0.55-0.65) à des cas sans rapport (score ~0.8-1.0) sur les données
réelles du projet — pas une valeur théorique. Au-dessus du seuil, `_find_task` renvoie `None` et
l'agent répond `tool="not_found"` sans rien exécuter.

**Le principe général (au-delà de ce projet)** : dès qu'une IA peut déclencher une action
**destructive ou irréversible** à partir d'une résolution approximative (recherche sémantique,
correspondance floue...), il faut un mécanisme de rejet explicite ("je ne suis pas assez sûr, je ne
fais rien") — jamais supposer que "le meilleur résultat disponible" est forcément "un résultat
valable". C'est le même réflexe que la validation Pydantic de D1 (rejeter plutôt que laisser passer
une donnée qui a l'air correcte mais ne l'est pas), appliqué cette fois à la décision d'agir, pas
seulement à la donnée reçue.
