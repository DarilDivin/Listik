import argparse
import os
from datetime import date
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel

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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8420)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
