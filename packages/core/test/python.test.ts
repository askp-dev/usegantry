import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { CodeIndex } from "../src/context/code-index";
import { parsePipfileLock, parseUvLock } from "../src/context/lockfile-parser";
import type { Dependency, RuleDefinition } from "../src/context/types";
import { py01UnsafeDeserialization } from "../src/rules/python/py-01-unsafe-deserialization";
import { py02SyncInAsync } from "../src/rules/python/py-02-sync-in-async";
import { py03AgentExecSinks } from "../src/rules/python/py-03-agent-exec-sinks";
import { py04SharedState } from "../src/rules/python/py-04-shared-state";
import { qualify } from "../src/rules/python/py-helpers";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "preflight-py-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const ctxOf = (root: string) => buildRepoContext(root, { config: { offline: true } });
const run = async (rule: RuleDefinition, files: Record<string, string>) =>
  (await rule.run(await ctxOf(repo(files)))).map((f) => `${f.file}:${f.line}:${f.severity}`);
const py = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("Python lockfiles", () => {
  test("uv.lock: skips the editable project, resolves versions", () => {
    const m = new Map<string, Dependency>();
    parseUvLock(
      'version = 1\n\n[[package]]\nname = "my-app"\nversion = "0.1.0"\nsource = { editable = "." }\n\n[[package]]\nname = "Pydantic_Core"\nversion = "2.18.4"\nsource = { registry = "https://pypi.org/simple" }\n',
      m,
    );
    expect([...m.keys()]).toEqual(["pypi:pydantic-core"]);
    expect(m.get("pypi:pydantic-core")?.version).toBe("2.18.4");
  });
  test("Pipfile.lock: default + develop, == stripped, bad JSON ignored", () => {
    const m = new Map<string, Dependency>();
    parsePipfileLock(JSON.stringify({ default: { requests: { version: "==2.32.3" } }, develop: { pytest: { version: "==8.2.2" } } }), m);
    parsePipfileLock("{not json", m);
    expect(m.get("pypi:requests")).toMatchObject({ version: "2.32.3", isDev: false });
    expect(m.get("pypi:pytest")).toMatchObject({ version: "8.2.2", isDev: true });
  });
  test("lock version wins over the manifest range", async () => {
    const ctx = await ctxOf(
      repo({ "pyproject.toml": '[project]\ndependencies = ["torch>=2.2"]\n', "uv.lock": '[[package]]\nname = "torch"\nversion = "2.3.1"\n' }),
    );
    expect(ctx.dependencies.get("pypi:torch")).toMatchObject({ version: "2.3.1", isDirect: true });
  });
});

test("qualify resolves import aliases", () => {
  const ci = new CodeIndex(py("import pickle as pk", "from yaml import load as yl", "import numpy.linalg", "from torch import load"), "a.py");
  expect(qualify(ci, "pk.loads")).toBe("pickle.loads");
  expect(qualify(ci, "yl")).toBe("yaml.load");
  expect(qualify(ci, "numpy.linalg.norm")).toBe("numpy.linalg.norm");
  expect(qualify(ci, "load")).toBe("torch.load");
  expect(qualify(ci, "other.loads")).toBe("other.loads");
});

describe("PY-01", () => {
  test("aliases, positional SafeLoader, numpy allow_pickle, tests skipped", async () => {
    const out = await run(py01UnsafeDeserialization, {
      "a.py": py(
        "import pickle as pk",
        "import numpy as np",
        "import yaml",
        "def f(b):",
        "    pk.loads(b)", // 5 HIGH
        "    yaml.load(b, yaml.SafeLoader)",
        "    yaml.load(b)", // 7 HIGH
        "    yaml.unsafe_load(b)", // 8 HIGH
        "    np.load(b, allow_pickle=True)", // 9 HIGH
        "    np.load(b)",
        "    pk.loads(request.body)", // 11 CRITICAL
      ),
      "tests/test_a.py": py("import pickle", "pickle.loads(x)"),
    });
    expect(out).toEqual(["a.py:5:HIGH", "a.py:7:HIGH", "a.py:8:HIGH", "a.py:9:HIGH", "a.py:11:CRITICAL"]);
  });
  test("torch.load without weights_only passes only when torch ≥2.6 is resolved", async () => {
    const code = py("import torch", "torch.load('m.pt')");
    expect(await run(py01UnsafeDeserialization, { "m.py": code, "requirements.txt": "torch==2.6.0\n" })).toEqual([]);
    expect(await run(py01UnsafeDeserialization, { "m.py": code, "requirements.txt": "torch==2.5.1\n" })).toEqual(["m.py:2:HIGH"]);
    expect(
      await run(py01UnsafeDeserialization, { "m.py": py("import torch", "torch.load('m.pt', weights_only=False)"), "requirements.txt": "torch==2.6.0\n" }),
    ).toEqual(["m.py:2:CRITICAL"]);
  });
});

describe("PY-02", () => {
  const head = ["import time, requests", "from fastapi import FastAPI", "import asyncio", "app = FastAPI()"];
  test("flags blocking calls only in async route handlers, outside offloads and nested defs", async () => {
    const out = await run(py02SyncInAsync, {
      "main.py": py(
        ...head,
        "@app.get('/a')",
        "async def a():",
        "    time.sleep(1)", // 7
        "    await asyncio.to_thread(lambda: requests.get('x'))",
        "    def inner():",
        "        requests.get('y')",
        "    return await asyncio.to_thread(inner)",
        "@app.get('/b')",
        "def b():",
        "    time.sleep(1)",
        "async def helper():",
        "    time.sleep(1)",
      ),
    });
    expect(out).toEqual(["main.py:7:HIGH"]);
  });
  test("sync SDK clients and sync SQLAlchemy sessions; async twins pass", async () => {
    const out = await run(py02SyncInAsync, {
      "main.py": py(
        ...head,
        "from anthropic import Anthropic, AsyncAnthropic",
        "from sqlalchemy.orm import Session",
        "sync = Anthropic()",
        "aio = AsyncAnthropic()",
        "@app.post('/c')",
        "async def c(db: Session):",
        "    sync.messages.create(model='m')", // 11
        "    await aio.messages.create(model='m')",
        "    db.execute('select 1')", // 13
        "    return db",
      ),
    });
    expect(out).toEqual(["main.py:11:HIGH", "main.py:13:HIGH"]);
  });
});

describe("PY-03", () => {
  test("CRITICAL when served to users, HIGH in a script; load_tools names", async () => {
    expect(await run(py03AgentExecSinks, { "s.py": py("from langchain_experimental.utilities import PythonREPL", "PythonREPL().run(code)") })).toEqual([
      "s.py:2:HIGH",
    ]);
    expect(
      await run(py03AgentExecSinks, {
        "bot.py": py(
          "import streamlit as st",
          "from langchain.agents import load_tools",
          "tools = load_tools(['terminal', 'llm-math'])",
          "safe = load_tools(['wikipedia'])",
        ),
      }),
    ).toEqual(["bot.py:3:CRITICAL"]);
  });
  test("allow_dangerous_code=False is fine", async () => {
    expect(
      await run(py03AgentExecSinks, { "a.py": py("from x import create_csv_agent", "create_csv_agent(llm, 'f.csv', allow_dangerous_code=False)") }),
    ).toEqual([]);
  });
});

describe("PY-04", () => {
  test("mutable defaults: HIGH when mutated, MEDIUM otherwise; None/tuple pass", async () => {
    const out = await run(py04SharedState, {
      "u.py": py("def a(x=[]):", "    x.append(1)", "def b(opts={}):", "    return opts", "def c(x=None, y=()):", "    return x"),
    });
    expect(out).toEqual(["u.py:1:HIGH", "u.py:3:MEDIUM"]);
  });
  test("module stores: per-user names fire, read-only constants and class attrs don't", async () => {
    const out = await run(py04SharedState, {
      "s.py": py(
        "from fastapi import FastAPI",
        "app = FastAPI()",
        "sessions = {}",
        "_cache = {}",
        "LIMITS = {'a': 1}",
        "counts = dict()",
        "class C:",
        "    store = {}",
        "def remember(user_id, v):",
        "    sessions[user_id] = v",
        "    _cache['k'] = v",
        "@app.get('/n')",
        "def n():",
        "    counts['hits'] = 1",
        "    return LIMITS",
      ),
    });
    expect(out).toEqual(["s.py:3:HIGH", "s.py:6:MEDIUM"]);
  });
});
