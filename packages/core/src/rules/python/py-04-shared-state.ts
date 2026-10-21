import type { FnInfo } from "../../context/code-index";
import { defineRule } from "../helpers";
import { isRouteHandler, pyCalls, pyFiles } from "./py-helpers";

const MUTATES = (v: string) =>
  new RegExp(
    `(?<![\\w.])${v}(?:\\s*\\[[^\\]\\n]*\\])*\\s*(?:\\[[^\\]\\n]*\\]\\s*(?:=(?!=)|\\+=|\\|=)|\\.(?:append|extend|insert|update|setdefault|add|pop|popitem|remove|clear|discard|__setitem__)\\s*\\()`,
  );
/** Start of a (possibly multi-line) mutable value. */
const MUTABLE_START = /^(?:\[|\{|(?:list|dict|set|bytearray|defaultdict|OrderedDict|Counter|deque)\s*\()/;
/** Names / keys that hold one user's data. */
const PER_USER = /hist|chat|conversation|message|session|memor|context|thread|user|cart|token|prompt|state|tenant|request/i;
/** LangChain / LlamaIndex chat memory instantiated once per process. */
const MEMORY_CTOR =
  /(?:^|\.)(?:Conversation\w*Memory|ChatMessageHistory|InMemoryChatMessageHistory|ChatMemoryBuffer|SimpleChatStore|MemorySaver|InMemorySaver)$/;

export const py04SharedState = defineRule(
  { id: "PY-04", pillar: "SECURITY", severity: "HIGH", title: "Per-Request State Shared Across Users (Mutable Default / Module-Level Store)" },
  (ctx, emit) => {
    for (const file of pyFiles(ctx, /def\s/)) {
      const ci = ctx.getCode(file);
      const fns = ci.functions();
      const body = (fn: FnInfo) => ci.slice(fn.bodyStart, fn.bodyEnd + 1, "masked");

      // 1. Mutable default arguments
      for (const fn of fns) {
        for (const [a, b] of ci.splitTopLevel(fn.paramsStart + 1, fn.paramsEnd)) {
          const m = ci.slice(a, b, "masked").match(/^\*{0,2}([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*([\s\S]+)$/);
          if (!m || !MUTABLE_START.test(m[2].trim())) continue;
          const mutated = MUTATES(m[1]).test(body(fn));
          const line = ci.lineOf(a);
          emit({
            file,
            line,
            severity: mutated ? "HIGH" : "MEDIUM",
            evidence: ci.lineText(line).trim(),
            impact: `The default \`${m[1]}=${m[2].trim()}\` is created once, when \`def ${fn.name}\` runs at import, and shared by every call that omits it.${mutated ? " The function mutates it, so data from one request (one user's items, messages or context) persists into the next caller's call." : " Any later mutation leaks state between calls and users."}`,
            agentRemediationPrompt: `In ${file}:${line}, change the default to \`${m[1]}: ... | None = None\` and create a fresh value inside \`${fn.name}\` (\`if ${m[1]} is None: ${m[1]} = ${/^\{|dict/.test(m[2].trim()) ? "{}" : "[]"}\`).`,
          });
        }
      }

      // 2. Module-level stores mutated per request
      const handlers = fns.filter(isRouteHandler);
      for (const m of ci.findAll(/^([A-Za-z_]\w*)[ \t]*(?::[^=\n]+)?=[ \t]*(?!=)([^\n]+)/gm)) {
        const [, name, rhs] = m;
        if (/^(?:else|try|finally|except|elif|if|while|for|with|lambda)$/.test(name)) continue;
        const line = ci.lineOf(m.index);
        const memory = pyCalls(ci, MEMORY_CTOR, m.index, m.index + m[0].length).length > 0;
        if (!memory && !MUTABLE_START.test(rhs.trim())) continue;
        const users = fns.filter((f) => (memory ? new RegExp(`(?<![\\w.])${name}\\b`) : MUTATES(name)).test(body(f)));
        if (!users.length) continue;
        const inRoute = users.filter((f) => handlers.includes(f));
        const keyedByUser = users.some((f) => new RegExp(`${name}\\s*\\[[^\\]]*(?:${PER_USER.source})`, "i").test(body(f)));
        if (!memory && !inRoute.length && !PER_USER.test(name)) continue;
        const severity = memory || PER_USER.test(name) || keyedByUser ? "HIGH" : "MEDIUM";
        const where = (inRoute[0] ?? users[0]).name;
        emit({
          file,
          line,
          severity,
          evidence: ci.lineText(line).trim(),
          impact: memory
            ? `\`${name}\` is one chat-memory object for the whole process, and \`${where}\` uses it for every request, so all users share one conversation: user B's answers are conditioned on (and can quote) user A's messages.`
            : `\`${name}\` is module-level state that \`${where}\` mutates per request. It is shared by every user and concurrent request in this worker (a cross-user data leak when it holds chats/sessions), grows without bound, and silently diverges across Uvicorn/Gunicorn workers and restarts.`,
          agentRemediationPrompt: `In ${file}:${line}, move \`${name}\` out of module scope: keep per-user/per-conversation state in a store keyed by the authenticated user and conversation id (Redis with a TTL, or a database table), ${memory ? "and build the memory per request from that history (e.g. `RunnableWithMessageHistory` with a `get_session_history(session_id)` backed by Redis/Postgres)" : "and load it per request via a FastAPI dependency"}. Never key it by a client-supplied id without checking ownership.`,
        });
      }
    }
  },
);
