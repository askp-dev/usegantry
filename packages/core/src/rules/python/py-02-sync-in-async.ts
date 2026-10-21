import { defineRule } from "../helpers";
import { isRouteHandler, pyBindings, pyCalls, pyFiles } from "./py-helpers";

/** Blocking calls by qualified name. */
const BLOCKING: Array<[RegExp, string]> = [
  [/^time\.sleep$/, "use `await asyncio.sleep(...)`"],
  [/^requests\.(?:get|post|put|patch|delete|head|options|request)$/, "use `httpx.AsyncClient` (`async with httpx.AsyncClient() as c: await c.get(...)`)"],
  [/^httpx\.(?:get|post|put|patch|delete|head|options|request|stream)$/, "use a shared `httpx.AsyncClient` and `await` it"],
  [/^urllib\.request\.urlopen$|^urllib3\.\w+$/, "use `httpx.AsyncClient`"],
  [/^subprocess\.(?:run|call|check_call|check_output)$|^os\.(?:system|popen)$/, "use `await asyncio.create_subprocess_exec(...)`"],
  [
    /^(?:psycopg2|pymysql|MySQLdb|sqlite3|mysql\.connector)\.connect$/,
    "use an async driver (`asyncpg`, `psycopg` async, `aiomysql`, `aiosqlite`) or a pooled `AsyncEngine`",
  ],
  [/^boto3\.(?:client|resource)$/, "create the client once at startup and call it via `await asyncio.to_thread(...)`, or use `aioboto3`"],
];
/** Sync SDK constructors whose instances block on every call (async twins exist). */
const SYNC_CLIENT_CTOR =
  /^(?:openai\.(?:OpenAI|AzureOpenAI)|anthropic\.(?:Anthropic|AnthropicBedrock|AnthropicVertex)|groq\.Groq|mistralai\.Mistral|cohere\.Client|cohere\.ClientV2|redis\.(?:Redis|StrictRedis|from_url)|redis\.Redis\.from_url|pymongo\.MongoClient|elasticsearch\.Elasticsearch|qdrant_client\.QdrantClient)$/;
/** Calls run off the event loop, so blocking calls inside their arguments are fine. */
const OFFLOAD = /(?:to_thread|run_in_threadpool|run_in_executor|run_sync|iterate_in_threadpool|sync_to_async)$/;
/** Sync SQLAlchemy `Session` / psycopg cursor methods. */
const SESSION_METHODS = /^(?:query|execute|scalars?|scalar_one|get|commit|flush|refresh|add_all|delete|merge|fetchall|fetchone|fetchmany)$/;

export const py02SyncInAsync = defineRule(
  { id: "PY-02", pillar: "FINOPS_OPS", severity: "HIGH", title: "Blocking Call Inside an `async def` FastAPI Route (Event-Loop Freeze)" },
  (ctx, emit) => {
    for (const file of pyFiles(ctx, /async\s+def/)) {
      const ci = ctx.getCode(file);
      const handlers = ci.functions().filter((f) => f.isAsync && isRouteHandler(f));
      if (!handlers.length) continue;
      const syncSqlalchemy = [...pyBindings(ci).values()].some((q) => /^sqlalchemy\.orm\.Session$|^sqlmodel\.Session$|^psycopg2\b/.test(q));
      // Module-level `client = OpenAI()` style instances
      const syncClients = new Set<string>();
      for (const c of pyCalls(ci, SYNC_CLIENT_CTOR)) {
        const m = ci.slice(ci.lineStart(c.line), c.start, "masked").match(/^\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*$/);
        if (m) syncClients.add(m[1]);
      }

      for (const fn of handlers) {
        // Nested defs/lambdas and offloaded arguments run elsewhere.
        const skip: Array<[number, number]> = ci
          .functions()
          .filter((f) => f !== fn && f.start > fn.bodyStart && f.bodyEnd <= fn.bodyEnd)
          .map((f) => [f.start, f.bodyEnd]);
        for (const c of pyCalls(ci, OFFLOAD, fn.bodyStart, fn.bodyEnd + 1)) skip.push([c.openParen, c.closeParen]);
        const skipped = (pos: number) => skip.some(([a, b]) => pos >= a && pos <= b);
        const awaited = (pos: number) => /\bawait\s+$/.test(ci.slice(ci.lineStart(ci.lineOf(pos)), pos, "masked"));
        const params = ci.slice(fn.paramsStart, fn.paramsEnd + 1, "masked");
        const sessionParams = syncSqlalchemy ? [...params.matchAll(/([A-Za-z_]\w*)\s*:\s*(?:Session|SessionDep|cursor|connection)\b/g)].map((m) => m[1]) : [];
        const seen = new Set<number>();

        for (const c of pyCalls(ci, /./, fn.bodyStart, fn.bodyEnd + 1)) {
          if (skipped(c.start) || awaited(c.start) || seen.has(c.line)) continue;
          let fix = BLOCKING.find(([re]) => re.test(c.qname))?.[1];
          const [head, ...rest] = c.qname.split(".");
          if (!fix && syncClients.has(head) && rest.length)
            fix = `construct the async twin of the client (\`AsyncOpenAI()\`, \`AsyncAnthropic()\`, \`redis.asyncio.Redis\`, \`AsyncQdrantClient\`, Motor for Mongo) and \`await\` the call`;
          if (!fix && sessionParams.includes(head) && rest.length === 1 && SESSION_METHODS.test(rest[0]))
            fix = "switch to `AsyncSession` from `sqlalchemy.ext.asyncio` with an async driver and `await` the query, or declare the route with plain `def`";
          if (!fix) continue;
          seen.add(c.line);
          emit({
            file,
            line: c.line,
            evidence: ci.snippet(c.start),
            impact: `\`${c.qname}()\` blocks inside \`async def ${fn.name}\`, which runs on the event loop itself. While it waits on the network/disk/sleep, that Uvicorn worker serves no other request, so a few slow calls freeze the whole API (timeouts, failed health checks, autoscaling on idle CPU).`,
            agentRemediationPrompt: `In ${file}:${c.line} (\`${fn.name}\`), ${fix}. If the handler has no other awaits, declaring it with plain \`def\` also works: FastAPI then runs it in its threadpool. A one-off blocking call can be wrapped in \`await asyncio.to_thread(...)\`.`,
          });
        }
      }
    }
  },
);
