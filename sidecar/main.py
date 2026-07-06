import argparse
import json
import os
from datetime import date
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel

import vecstore

load_dotenv()

app = FastAPI()

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")
LLM_API_KEY = os.environ.get("LLM_API_KEY")

llm = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class ParseRequest(BaseModel):
    text: str


class SmartTaskData(BaseModel):
    text: str
    note: str | None = None
    due_date: str | None = None
    priority: Literal["low", "normal", "high"] = "normal"
    list: str | None = None


def build_system_prompt() -> str:
    today = date.today().isoformat()
    return f"""Tu extrais les informations d'une tâche à faire, écrite en langage naturel \
français, et tu réponds UNIQUEMENT avec un objet JSON (aucun texte autour), au format :
{{"text": string, "note": string|null, "due_date": string|null (YYYY-MM-DD), "priority": "low"|"normal"|"high", "list": string|null}}

- "text" : la tâche débarrassée de la date, du tag #liste et de la note "// ...".
- "note" : ce qui suit "//", sinon null.
- "due_date" : date ISO déduite du texte (aujourd'hui = {today}), sinon null.
- "list" : le mot après un tag #, sinon null.
- "priority" :
  - "high" si urgence explicite ("urgent", "important", "!!", "asap")
  - "normal" si NÉGATION d'urgence ("pas urgent", "rien d'urgent") — ne pas se laisser
    piéger par la seule présence du mot "urgent"
  - "low" si "plus tard", "quand possible", "pas pressé"
  - "normal" sinon

Exemples :
Texte : "appeler maman demain, pas urgent #famille // penser à son anniversaire"
JSON : {{"text": "appeler maman", "note": "penser à son anniversaire", "due_date": "2026-07-03", "priority": "normal", "list": "famille"}}

Texte : "finir le rapport vendredi urgent"
JSON : {{"text": "finir le rapport", "note": null, "due_date": "2026-07-04", "priority": "high", "list": null}}

Texte : "ranger le garage un jour, pas pressé"
JSON : {{"text": "ranger le garage", "note": null, "due_date": null, "priority": "low", "list": null}}
"""


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


# ---------------------------------------------------------------------------
# D2 — RAG : indexation + recherche sémantique (tâches et notes)
# ---------------------------------------------------------------------------


class IndexRequest(BaseModel):
    id: str
    type: Literal["task", "note"]
    text: str


@app.post("/index")
def index(req: IndexRequest) -> dict[str, str]:
    vecstore.upsert_item(req.id, req.type, req.text)
    return {"status": "ok"}


class DeindexRequest(BaseModel):
    id: str


@app.post("/deindex")
def deindex(req: DeindexRequest) -> dict[str, str]:
    vecstore.remove_item(req.id)
    return {"status": "ok"}


class SearchRequest(BaseModel):
    query: str
    k: int = 5


class SearchResult(BaseModel):
    id: str
    type: str
    text: str
    score: float


@app.post("/search")
def search(req: SearchRequest) -> list[SearchResult]:
    return [SearchResult(**r) for r in vecstore.search(req.query, req.k)]


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[SearchResult]


@app.post("/ask")
def ask(req: AskRequest) -> AskResponse:
    results = vecstore.search(req.question, k=5)
    context = "\n".join(f"- ({r['type']}) {r['text']}" for r in results) or "(aucun résultat trouvé)"

    try:
        completion = llm.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Tu réponds à la question de l'utilisateur en te basant UNIQUEMENT sur "
                        "le contexte fourni (ses tâches et notes). Si le contexte ne permet pas "
                        "de répondre, dis-le clairement plutôt que d'inventer.\n\n"
                        f"Contexte :\n{context}"
                    ),
                },
                {"role": "user", "content": req.question},
            ],
            temperature=0.2,
        )
        answer = completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return AskResponse(answer=answer, sources=[SearchResult(**r) for r in results])


# ---------------------------------------------------------------------------
# D4 — Agent : function calling (le LLM choisit l'outil, notre code exécute)
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


# Nombre d'échanges passés renvoyés au LLM : au-delà, coût en tokens/latence
# pour un bénéfice marginal sur la résolution de contexte ("et demain ?").
MAX_HISTORY_MESSAGES = 12


class AgentRequest(BaseModel):
    text: str
    history: list[ChatMessage] = []


class NoteDraft(BaseModel):
    title: str = ""
    content: str = ""


class TaskUpdate(BaseModel):
    text: str | None = None
    status: Literal["pending", "completed"] | None = None
    priority: Literal["low", "normal", "high"] | None = None
    due_date: str | None = None


class AgentResponse(BaseModel):
    # Outil choisi par le LLM. `create_task`/`create_note` = à exécuter par Rust
    # (propriétaire de SQLite) ; `answer_question` déjà résolu ici (RAG).
    # `update_task`/`delete_task` : la tâche est déjà *retrouvée* ici (task_id),
    # mais l'exécution réelle se fait côté frontend, pour réutiliser le même
    # circuit que la suppression manuelle (annulation possible, D3 inclus).
    tool: Literal[
        "create_task", "create_note", "answer_question",
        "update_task", "delete_task", "not_found",
    ]
    message: str
    task: SmartTaskData | None = None
    note: NoteDraft | None = None
    sources: list[SearchResult] = []
    task_id: str | None = None
    update: TaskUpdate | None = None


# Description des outils exposés au LLM (schéma JSON des paramètres). Le modèle
# ne voit que ça pour décider quoi appeler — d'où l'importance des descriptions.
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Créer une tâche à faire quand l'utilisateur demande d'ajouter/créer une tâche, un rappel, une chose à faire.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "L'intitulé de la tâche, sans la date."},
                    "note": {"type": "string", "description": "Détail optionnel."},
                    "due_date": {"type": "string", "description": "Date ISO YYYY-MM-DD si mentionnée, sinon omettre."},
                    "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                    "list": {"type": "string", "description": "Projet/liste si mentionné (ex. #courses)."},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Enregistrer une note libre quand l'utilisateur veut noter une idée, une information, un texte à garder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Titre court, optionnel."},
                    "content": {"type": "string", "description": "Le corps de la note."},
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "answer_question",
            "description": "Répondre à une question de l'utilisateur sur ses tâches et notes existantes (ex. « qu'est-ce que j'ai cette semaine ? »).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "La question, reformulée pour la recherche."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Modifier une tâche existante : la marquer faite/à faire, changer sa priorité, sa date, ou son texte.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Description de la tâche à modifier, pour la retrouver (ex. « la tâche du dentiste »)."},
                    "status": {"type": "string", "enum": ["pending", "completed"], "description": "Nouveau statut, si demandé (ex. « marque comme faite »)."},
                    "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                    "due_date": {"type": "string", "description": "Nouvelle date ISO YYYY-MM-DD si mentionnée."},
                    "text": {"type": "string", "description": "Nouveau texte, si l'utilisateur veut la reformuler."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Supprimer définitivement une tâche existante.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Description de la tâche à supprimer, pour la retrouver."},
                },
                "required": ["query"],
            },
        },
    },
]


# Distance cosinus (sqlite-vec) : 0 = identique, plus c'est haut, moins c'est
# proche. Seuil calibré empiriquement : une vraie correspondance tombe sous
# ~0.65-0.7 ; une requête sans rapport (ex. "vacances au Japon" sans tâche de
# ce genre) fait quand même remonter un "meilleur" résultat, mais au-delà de
# 0.8. Mieux vaut ne rien trouver que modifier/supprimer la mauvaise tâche.
MAX_TASK_MATCH_DISTANCE = 0.7


def _find_task(query: str) -> dict | None:
    """Résout une description en langage naturel vers la tâche la plus proche
    en sens (recherche sémantique, D2) — rejette si aucune n'est assez proche."""
    if not query.strip():
        return None
    matches = [r for r in vecstore.search(query, k=5) if r["type"] == "task"]
    if not matches or matches[0]["score"] > MAX_TASK_MATCH_DISTANCE:
        return None
    return matches[0]


def _run_rag(query: str) -> tuple[str, list[SearchResult]]:
    """Retrieve + generate : cœur de answer_question (réutilise D2)."""
    results = vecstore.search(query, k=5)
    context = "\n".join(f"- ({r['type']}) {r['text']}" for r in results) or "(aucun résultat trouvé)"
    completion = llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Tu réponds à la question en te basant UNIQUEMENT sur le contexte (tâches "
                    "et notes de l'utilisateur). Si le contexte ne suffit pas, dis-le plutôt "
                    f"que d'inventer.\n\nContexte :\n{context}"
                ),
            },
            {"role": "user", "content": query},
        ],
        temperature=0.2,
    )
    return completion.choices[0].message.content, [SearchResult(**r) for r in results]


@app.post("/agent")
def agent(req: AgentRequest) -> AgentResponse:
    today = date.today().isoformat()
    # Historique tronqué : les LLM sont sans état, on doit leur rappeler la
    # conversation à chaque appel pour qu'ils résolvent "et demain ?", etc.
    history = [
        {"role": h.role, "content": h.content} for h in req.history[-MAX_HISTORY_MESSAGES:]
    ]
    try:
        completion = llm.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Tu es l'assistant de Listik (aujourd'hui = {today}). À partir du "
                        "message de l'utilisateur, choisis exactement UN outil : créer une "
                        "tâche, créer une note, modifier ou supprimer une tâche existante, "
                        "ou répondre à une question sur ses données."
                    ),
                },
                *history,
                {"role": "user", "content": req.text},
            ],
            tools=AGENT_TOOLS,
            tool_choice="auto",
            temperature=0,
        )
        choice = completion.choices[0].message
        calls = choice.tool_calls or []

        # Pas d'outil choisi → on retombe sur une réponse RAG (best-effort).
        if not calls:
            answer, sources = _run_rag(req.text)
            return AgentResponse(tool="answer_question", message=answer, sources=sources)

        call = calls[0]
        name = call.function.name
        args = json.loads(call.function.arguments or "{}")

        if name == "create_task":
            task = SmartTaskData(**args)
            return AgentResponse(tool="create_task", message=f"Tâche créée : « {task.text} »", task=task)

        if name == "create_note":
            note = NoteDraft(**args)
            label = note.title or note.content[:40]
            return AgentResponse(tool="create_note", message=f"Note enregistrée : « {label} »", note=note)

        if name in ("update_task", "delete_task"):
            match = _find_task(args.get("query", ""))
            if match is None:
                return AgentResponse(
                    tool="not_found",
                    message=f"Je n'ai pas trouvé de tâche correspondant à « {args.get('query', '')} ».",
                )
            label = match["text"].splitlines()[0]
            if name == "delete_task":
                return AgentResponse(
                    tool="delete_task", message=f"Tâche supprimée : « {label} »", task_id=match["id"],
                )
            update = TaskUpdate(
                text=args.get("text"),
                status=args.get("status"),
                priority=args.get("priority"),
                due_date=args.get("due_date"),
            )
            return AgentResponse(
                tool="update_task", message=f"Tâche mise à jour : « {label} »",
                task_id=match["id"], update=update,
            )

        # answer_question
        answer, sources = _run_rag(args.get("query", req.text))
        return AgentResponse(tool="answer_question", message=answer, sources=sources)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8420)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
