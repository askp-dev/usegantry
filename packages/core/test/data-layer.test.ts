// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures below are source code containing `${…}` templates.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import type { RuleDefinition } from "../src/context/types";
import { cache01GlobalKeys } from "../src/rules/data/cache-01-global-keys";
import { cache02NoTtl } from "../src/rules/data/cache-02-no-ttl";
import { vec01TenantFilter } from "../src/rules/data/vec-01-tenant-filter";
import { vec02UnauthClient } from "../src/rules/data/vec-02-unauth-client";
import { vec03MetadataPii } from "../src/rules/data/vec-03-metadata-pii";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const AUTHED_PKG = JSON.stringify({ dependencies: { "next-auth": "4.24.0", "@qdrant/js-client-rest": "1.12.0", "@upstash/redis": "1.34.0" } });
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "preflight-data-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries({ "package.json": AUTHED_PKG, ...files })) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const ctxOf = (root: string) => buildRepoContext(root, { config: { offline: true } });
const lines = async (rule: RuleDefinition, files: Record<string, string>) => (await rule.run(await ctxOf(repo(files)))).map((f) => `${f.file}:${f.line}`);

describe("ctx.dataQueries", () => {
  test("tracks receivers through factories, derived handles and local imports; ignores look-alike Maps", async () => {
    const ctx = await ctxOf(
      repo({
        "lib/pc.ts": 'import { Pinecone } from "@pinecone-database/pinecone";\nexport const pc = new Pinecone();\n',
        "lib/search.ts": [
          'import { pc } from "./pc";',
          "export async function find(v: number[]) {",
          '  const index = pc.index("docs");',
          "  const cache = new Map<string, string>();",
          "  cache.set(`k:${v[0]}`, 'x');",
          "  return index.query({ vector: v, topK: 3 });",
          "}",
        ].join("\n"),
      }),
    );
    expect(ctx.dataQueries.map((q) => `${q.file}:${q.line} ${q.vendor} ${q.op} ${q.method}`)).toEqual([
      "lib/pc.ts:2 pinecone client Pinecone",
      "lib/search.ts:6 pinecone search query",
    ]);
  });

  test("Python clients, pgvector SQL and Supabase match_* RPCs", async () => {
    const ctx = await ctxOf(
      repo({
        "app/rag.py":
          "from qdrant_client import QdrantClient\nclient = QdrantClient(url=URL)\ndef f(v):\n    return client.search(collection_name='d', query_vector=v)\n",
        "lib/sql.ts": "export const q = (v: string) => prisma.$queryRaw`SELECT id FROM docs ORDER BY embedding <=> ${v} LIMIT 5`;\n",
        "lib/rpc.ts": 'export const r = (e: number[]) => supabase.rpc("match_documents", { query_embedding: e });\n',
      }),
    );
    expect(ctx.dataQueries.map((q) => `${q.file}:${q.line} ${q.vendor} ${q.op}`).sort()).toEqual([
      "app/rag.py:2 qdrant client",
      "app/rag.py:4 qdrant search",
      "lib/rpc.ts:1 pgvector search",
      "lib/sql.ts:1 pgvector search",
    ]);
  });
});

describe("VEC-01", () => {
  const search = (args: string) => ({
    "lib/q.ts": 'import { QdrantClient } from "@qdrant/js-client-rest";\nexport const q = new QdrantClient({ url: U, apiKey: K });\n',
    "app/api/s/route.ts": `import { q } from "@/lib/q";\nexport async function POST(req: Request) {\n  const s = await auth();\n  const v = await req.json();\n${args}\n}\n`,
  });
  test("fires without a tenant filter, silent with one (inline or built earlier)", async () => {
    expect(await lines(vec01TenantFilter, search('  return q.search("d", { vector: v });'))).toEqual(["app/api/s/route.ts:5"]);
    expect(
      await lines(vec01TenantFilter, search('  return q.search("d", { vector: v, filter: { must: [{ key: "org_id", match: { value: s.orgId } }] } });')),
    ).toEqual([]);
    expect(
      await lines(
        vec01TenantFilter,
        search('  const filter = { must: [{ key: "tenant_id", match: { value: s.t } }] };\n  return q.search("d", { vector: v, filter });'),
      ),
    ).toEqual([]);
  });
  test("pgvector SQL and RPC need a tenant predicate", async () => {
    expect(await lines(vec01TenantFilter, { "lib/a.ts": "export const a = (v) => sql`SELECT * FROM d ORDER BY e <-> ${v}`;\n" })).toEqual(["lib/a.ts:1"]);
    expect(
      await lines(vec01TenantFilter, { "lib/a.ts": "export const a = (v, o) => sql`SELECT * FROM d WHERE org_id = ${o} ORDER BY e <-> ${v}`;\n" }),
    ).toEqual([]);
    expect(
      await lines(vec01TenantFilter, { "lib/r.ts": 'export const r = (e, o) => supabase.rpc("match_documents", { query_embedding: e, p_org_id: o });\n' }),
    ).toEqual([]);
  });
  test("Pinecone per-tenant namespace counts; a literal namespace does not", async () => {
    const pine = (chain: string) => ({
      "lib/p.ts": `import { Pinecone } from "@pinecone-database/pinecone";\nconst pc = new Pinecone();\nexport const f = (v, s) => pc.index("d")${chain}.query({ vector: v, topK: 3 });\n`,
    });
    expect(await lines(vec01TenantFilter, pine(".namespace(s.orgId)"))).toEqual([]);
    expect(await lines(vec01TenantFilter, pine('.namespace("default")'))).toEqual(["lib/p.ts:3"]);
  });
  test("single-user apps (no auth anywhere) are skipped", async () => {
    const files = {
      "package.json": JSON.stringify({ dependencies: { "@qdrant/js-client-rest": "1.12.0" } }),
      ...search('  return q.search("d", { vector: v });'),
    };
    files["app/api/s/route.ts"] = files["app/api/s/route.ts"].replace("  const s = await auth();\n", "");
    expect(await lines(vec01TenantFilter, files)).toEqual([]);
  });
});

describe("VEC-02", () => {
  test("missing key, plaintext remote http, embedded stores and SaaS-only clients", async () => {
    const lib = (body: string) => ({ "lib/v.ts": `import { QdrantClient } from "@qdrant/js-client-rest";\n${body}\n` });
    expect(await lines(vec02UnauthClient, lib("export const a = new QdrantClient({ url: process.env.QDRANT_URL });"))).toEqual(["lib/v.ts:2"]);
    expect(await lines(vec02UnauthClient, lib('export const a = new QdrantClient({ url: "http://10.0.0.5:6333", apiKey: K });'))).toEqual(["lib/v.ts:2"]);
    expect(
      await lines(vec02UnauthClient, lib("export const a = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY });")),
    ).toEqual([]);
    expect(
      await lines(vec02UnauthClient, { "a.py": 'import chromadb\nc = chromadb.PersistentClient(path="./db")\nh = chromadb.HttpClient(host="10.0.0.5")\n' }),
    ).toEqual(["a.py:3"]);
    expect(await lines(vec02UnauthClient, { "p.ts": 'import { Pinecone } from "@pinecone-database/pinecone";\nexport const pc = new Pinecone();\n' })).toEqual(
      [],
    );
  });
  test("compose: published on all interfaces without server auth; loopback or API key is fine", async () => {
    const compose = (ports: string, env = "") => ({
      "docker-compose.yml": `services:\n  chroma:\n    image: chromadb/chroma:0.5.0\n    ports:\n      - "${ports}"\n${env}`,
    });
    expect(await lines(vec02UnauthClient, compose("8000:8000"))).toEqual(["docker-compose.yml:5"]);
    expect(await lines(vec02UnauthClient, compose("127.0.0.1:8000:8000"))).toEqual([]);
    expect(await lines(vec02UnauthClient, compose("8000:8000", "    environment:\n      CHROMA_SERVER_AUTHN_CREDENTIALS: ${TOKEN}\n"))).toEqual([]);
  });
});

describe("VEC-03", () => {
  test("PII keys or user records in metadata fire; opaque ids and hashed values don't", async () => {
    const up = (payload: string) => ({
      "u.py": `from qdrant_client import QdrantClient\nc = QdrantClient(url=U, api_key=K)\ndef f(u, v):\n    c.upsert(collection_name="d", points=[PointStruct(id=1, vector=v, payload=${payload})])\n`,
    });
    expect(await lines(vec03MetadataPii, up('{"email": u.email}'))).toEqual(["u.py:4"]);
    expect(await lines(vec03MetadataPii, up("{**user}"))).toEqual(["u.py:4"]);
    expect(await lines(vec03MetadataPii, up('{"doc_id": 1, "org_id": u.org_id}'))).toEqual([]);
    expect(await lines(vec03MetadataPii, up('{"email_hash": hash_email(u.email)}'))).toEqual([]);
  });
});

describe("CACHE-01 / CACHE-02", () => {
  const route = (body: string) => ({
    "lib/r.ts": 'import Redis from "ioredis";\nexport const redis = new Redis(process.env.REDIS_URL!);\n',
    "app/api/c/route.ts": `import { redis } from "@/lib/r";\nexport async function GET() {\n  const s = await auth();\n${body}\n  return Response.json({});\n}\n`,
  });
  test("CACHE-01: constant key in an authed route; tenant-prefixed or explicit global keys pass", async () => {
    expect(await lines(cache01GlobalKeys, route('  await redis.set("stats", "1", "EX", 60);'))).toEqual(["app/api/c/route.ts:4"]);
    expect(await lines(cache01GlobalKeys, route('  await redis.set(`t:${s.orgId}:stats`, "1", "EX", 60);'))).toEqual([]);
    expect(await lines(cache01GlobalKeys, route('  await redis.set("global:fx_rates", "1", "EX", 60);'))).toEqual([]);
  });
  test("CACHE-02: dynamic key without TTL; options, setex or a later expire pass", async () => {
    expect(await lines(cache02NoTtl, route("  await redis.hset(`s:${s.id}`, { a: 1 });"))).toEqual(["app/api/c/route.ts:4"]);
    expect(await lines(cache02NoTtl, route('  await redis.set(`s:${s.id}`, "1", "EX", 60);'))).toEqual([]);
    expect(await lines(cache02NoTtl, route('  await redis.setex(`s:${s.id}`, 60, "1");'))).toEqual([]);
    expect(await lines(cache02NoTtl, route("  await redis.incr(`rl:${s.id}`);\n  await redis.expire(`rl:${s.id}`, 60);"))).toEqual([]);
    expect(await lines(cache02NoTtl, route('  await redis.set("singleton", "1");'))).toEqual([]);
  });
});
