import asyncio
import time

import httpx
import requests
from fastapi import Depends, FastAPI
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session
from .models import Order

app = FastAPI()
client = AsyncOpenAI()
http = httpx.AsyncClient()


@app.get("/weather")
async def weather(city: str):
    resp = await http.get(f"https://api.weather.example/{city}")
    await asyncio.sleep(1)
    return resp.json()


@app.post("/ask")
async def ask(question: str):
    completion = await client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": question}])
    return {"answer": completion.choices[0].message.content}


@app.get("/orders")
async def orders(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Order))
    return result.scalars().all()


@app.get("/legacy")
async def legacy():
    data = await asyncio.to_thread(requests.get, "https://legacy.example.com")
    def slow():
        time.sleep(0.1)
        return 1
    return {"status": data.status_code, "n": await asyncio.to_thread(slow)}


@app.get("/status")
def status():
    time.sleep(0.1)
    return requests.get("https://status.example.com").json()
