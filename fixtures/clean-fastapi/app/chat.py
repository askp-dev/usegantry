from fastapi import FastAPI

from .history import RedisHistory

app = FastAPI()
ALLOWED_MODELS = ["gpt-4o-mini"]
DEFAULTS = {"temperature": 0.2}


def add_tags(text: str, tags: list[str] | None = None):
    tags = [] if tags is None else tags
    tags.append(text)
    return tags


@app.post("/chat/{conversation_id}")
async def chat(conversation_id: str, message: str):
    history = RedisHistory(conversation_id)
    await history.add(message)
    return {"history": await history.all(), "model": ALLOWED_MODELS[0], **DEFAULTS}


class Settings:
    cache: dict = {}
