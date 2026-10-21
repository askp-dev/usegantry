import time

import requests
from fastapi import Depends, FastAPI
from openai import OpenAI
from sqlalchemy.orm import Session

from .db import get_db

app = FastAPI()
client = OpenAI()


@app.get("/weather")
async def weather(city: str):
    resp = requests.get(f"https://api.weather.example/{city}")
    time.sleep(1)
    return resp.json()


@app.post("/ask")
async def ask(question: str):
    completion = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": question}])
    return {"answer": completion.choices[0].message.content}


@app.get("/orders")
async def orders(db: Session = Depends(get_db)):
    return db.query(Order).all()


# OK: sync route, FastAPI runs it in the threadpool
@app.get("/status")
def status():
    time.sleep(0.1)
    return requests.get("https://status.example.com").json()
