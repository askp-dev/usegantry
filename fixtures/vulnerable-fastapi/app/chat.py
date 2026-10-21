from fastapi import FastAPI
from langchain.memory import ConversationBufferMemory

app = FastAPI()
memory = ConversationBufferMemory()
chat_histories = {}


def add_tags(text: str, tags=[]):
    tags.append(text)
    return tags


@app.post("/chat/{user_id}")
def chat(user_id: str, message: str):
    chat_histories.setdefault(user_id, []).append(message)
    memory.save_context({"input": message}, {"output": "ok"})
    return {"history": chat_histories[user_id]}


# OK: immutable default, read-only constant
ALLOWED_MODELS = ["gpt-4o-mini"]


def pick(model: str, fallback: tuple = ()):
    return model if model in ALLOWED_MODELS else fallback
