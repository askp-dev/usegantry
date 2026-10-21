import json

import torch
import yaml
from safetensors.torch import load_file


def load_model(path: str):
    return torch.load(path)


def load_weights(path: str):
    return load_file(path)


def load_config(path: str):
    with open(path) as f:
        return yaml.safe_load(f)


def load_config_explicit(path: str):
    with open(path) as f:
        return yaml.load(f, Loader=yaml.SafeLoader)


def decode(raw: bytes):
    return json.loads(raw)
