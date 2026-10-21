import pickle

import torch
import yaml
from fastapi import FastAPI, UploadFile
from redis import Redis

app = FastAPI()
cache = Redis()


def load_model(path: str):
    return torch.load(path)


def load_config(path: str):
    with open(path) as f:
        return yaml.load(f, Loader=yaml.Loader)


@app.get("/features/{user_id}")
def features(user_id: str):
    raw = cache.get(f"features:{user_id}")
    return pickle.loads(raw)


@app.post("/models")
def upload(file: UploadFile):
    return torch.load(file.file, weights_only=False)


# OK: safe variants
def load_weights(path: str):
    return torch.load(path, weights_only=True)


def load_settings(path: str):
    with open(path) as f:
        return yaml.safe_load(f)
