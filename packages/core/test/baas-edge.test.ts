// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures below are source code containing `${…}` templates.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { normalizeCondition, parseFirebaseRules } from "../src/context/firestore-rules";
import type { RuleDefinition } from "../src/context/types";
import { baas01ConvexAuth } from "../src/rules/baas/baas-01-convex-auth";
import { baas02FirestoreRules } from "../src/rules/baas/baas-02-firestore-rules";
import { baas03NosqlInjection } from "../src/rules/baas/baas-03-nosql-injection";
import { edge01UnencryptedReplica } from "../src/rules/edge/edge-01-unencrypted-replica";
import { edge02D1TenantPredicate } from "../src/rules/edge/edge-02-d1-tenant-predicate";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const PKG = JSON.stringify({ dependencies: { convex: "1.17.0", mongoose: "8.8.0", "@libsql/client": "0.14.0", "better-sqlite3": "11.5.0" } });
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "preflight-baas-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries({ "package.json": PKG, ...files })) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const run = async (rule: RuleDefinition, files: Record<string, string>) =>
  (await rule.run(await buildRepoContext(repo(files), { config: { offline: true } }))).map((f) => `${f.file}:${f.line} ${f.severity}`);

const CONVEX_IMPORT = 'import { mutation, query } from "./_generated/server";';
const PII_SQL = { "migrations/0001.sql": "CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT, body TEXT);\nCREATE TABLE people (id TEXT, email TEXT);\n" };

describe("Convex schema adapter", () => {
  test("defineTable entries become tables with PII flags and v.id references", async () => {
    const ctx = await buildRepoContext(
      repo({
        "convex/schema.ts":
          'export default defineSchema({ users: defineTable({ email: v.string(), fullName: v.string() }), notes: defineTable({ userId: v.id("users") }) });',
      }),
      { config: { offline: true } },
    );
    const users = ctx.dbTables.get("users")!;
    expect(users.source).toBe("convex");
    expect(users.columns.filter((c) => c.isPII).map((c) => c.name)).toEqual(["email", "fullName"]);
    expect(ctx.dbTables.get("notes")!.columns[0].foreignKeyTable).toBe("users");
  });
});

describe("BAAS-01 Convex", () => {
  test("an enforcing helper in another convex file, internal functions and admin role checks pass", async () => {
    const out = await run(baas01ConvexAuth, {
      "convex/lib.ts": "export async function requireMember(ctx) { const id = await ctx.auth.getUserIdentity(); if (!id) throw new Error('no'); return id; }",
      "convex/notes.ts": [
        CONVEX_IMPORT,
        "export const add = mutation({ handler: async (ctx, a) => { const me = await requireMember(ctx); await ctx.db.insert('notes', { userId: me.subject }); } });",
        "export const adminBan = mutation({ handler: async (ctx, a) => { const me = await ctx.auth.getUserIdentity(); if (!me || me.role !== 'admin') throw new Error('no'); } });",
        "export const purge = internalMutation({ handler: async (ctx) => {} });",
      ].join("\n"),
    });
    expect(out).toEqual([]);
  });
  test("reading the identity without checking it, and admin exports without a role check, fire", async () => {
    const out = await run(baas01ConvexAuth, {
      "convex/notes.ts": [
        CONVEX_IMPORT,
        "export const list = query({ handler: async (ctx) => { const me = await ctx.auth.getUserIdentity(); return ctx.db.query('notes').collect(); } });",
        "export const adminWipe = mutation({ handler: async (ctx) => { const me = await ctx.auth.getUserIdentity(); if (!me) throw new Error('no'); } });",
        "export default mutation(async (ctx) => {});",
      ].join("\n"),
    });
    expect(out).toEqual(["convex/notes.ts:2 HIGH", "convex/notes.ts:3 CRITICAL", "convex/notes.ts:4 CRITICAL"]);
  });
  test("convex/_generated and files without the generated builders are ignored", async () => {
    expect(
      await run(baas01ConvexAuth, {
        "convex/_generated/server.ts": "export const mutation = (x) => x;",
        "lib/q.ts": "export const q = query({ handler: () => 1 });",
      }),
    ).toEqual([]);
  });
});

describe("BAAS-02 Firebase rules", () => {
  test("parser nests match paths and inlines zero-arg helpers", () => {
    const rules = parseFirebaseRules(
      "service cloud.firestore {\n match /databases/{database}/documents {\n  function authed() { return request.auth != null; }\n  match /{doc=**} {\n   allow read: if authed(); // comment\n  }\n }\n}",
    );
    expect(rules).toEqual([
      { path: "/databases/{database}/documents/{doc=**}", methods: ["read"], condition: "(request.auth != null)", line: 5, recursive: true },
    ]);
    expect(normalizeCondition(rules[0].condition)).toBe("request.auth!=null");
  });
  test("owner-scoped rules and auth-only reads on a single collection pass; test mode fires", async () => {
    const ok = [
      "service cloud.firestore { match /databases/{database}/documents {",
      "  match /posts/{id} { allow read: if request.auth != null;",
      "    allow write: if request.auth != null && request.resource.data.ownerId == request.auth.uid; }",
      "} }",
    ].join("\n");
    expect(await run(baas02FirestoreRules, { "firestore.rules": ok })).toEqual([]);
    const testMode =
      "service cloud.firestore { match /databases/{database}/documents {\n  match /{document=**} {\n    allow read, write: if request.time < timestamp.date(2026, 12, 1);\n  } } }";
    expect(
      await run(baas02FirestoreRules, {
        "firestore.rules": testMode,
        "storage.rules": "service firebase.storage { match /b/{bucket}/o {\n match /{all=**} {\n allow read, write;\n } } }",
      }),
    ).toEqual(["firestore.rules:3 CRITICAL", "storage.rules:3 CRITICAL"]);
  });
});

describe("BAAS-03 Mongo", () => {
  const route = (body: string) => ({ "server/r.js": `router.post("/x", async (req, res) => {\n${body}\n});` });
  test("schema-parsed input, scalar casts, Array.find and $eq pass", async () => {
    const out = await run(
      baas03NosqlInjection,
      route(
        [
          "const input = schema.parse(req.body);",
          "await User.findOne({ email: input.email });",
          "await User.findOne({ email: String(req.body.email), org: { $eq: req.body.org } });",
          "const hit = items.find((i) => i.id === req.body.id);",
        ].join("\n"),
      ),
    );
    expect(out).toEqual([]);
  });
  test("destructured body, spread body and update payloads fire", async () => {
    const out = await run(
      baas03NosqlInjection,
      route(
        [
          "const { email } = req.body;",
          "await User.findOne({ email });",
          "await db.collection('u').updateOne({ _id: id }, req.body);",
          "await User.find({ ...req.body });",
        ].join("\n"),
      ),
    );
    expect(out).toEqual(["server/r.js:3 HIGH", "server/r.js:4 HIGH", "server/r.js:5 HIGH"]);
  });
  test("app-wide sanitizer or no Mongo dependency silences it", async () => {
    expect(await run(baas03NosqlInjection, { ...route("await User.find(req.body);"), "server/app.js": "app.use(mongoSanitize());" })).toEqual([]);
    expect(await run(baas03NosqlInjection, { "package.json": "{}", ...route("await User.find(req.body);") })).toEqual([]);
  });
});

describe("EDGE-01 local SQLite / embedded replica", () => {
  test("encryptionKey, SQLCipher pragmas and :memory: pass", async () => {
    const out = await run(edge01UnencryptedReplica, {
      ...PII_SQL,
      "lib/a.ts":
        'import { createClient } from "@libsql/client";\nexport const a = createClient({ url: "file:a.db", syncUrl: process.env.U, encryptionKey: process.env.K });',
      "lib/b.ts": 'import Database from "better-sqlite3";\nconst db = new Database("b.db");\ndb.pragma(`key = \'${process.env.K}\'`);',
      "lib/c.ts": 'import { Database } from "bun:sqlite";\nexport const c = new Database(":memory:");',
      "lib/d.ts": 'import { createClient } from "@libsql/client";\nexport const d = createClient({ url: process.env.TURSO_URL, authToken: process.env.T });',
    });
    expect(out).toEqual([]);
  });
  test("better-sqlite3 and Python sqlite3 files fire only when the schema has PII", async () => {
    const files = {
      "lib/b.ts": 'import Database from "better-sqlite3";\nexport const db = new Database("app.db");',
      "app/db.py": 'import sqlite3\nconn = sqlite3.connect("app.db")\n',
    };
    expect(await run(edge01UnencryptedReplica, { ...PII_SQL, ...files })).toEqual(["app/db.py:2 HIGH", "lib/b.ts:2 HIGH"]);
    expect(await run(edge01UnencryptedReplica, { "migrations/0001.sql": "CREATE TABLE jobs (id TEXT);", ...files })).toEqual([]);
  });
});

describe("EDGE-02 D1 / libSQL tenant predicate", () => {
  const wrangler = { "wrangler.toml": '[[d1_databases]]\nbinding = "DB"\n' };
  test("tenant predicates, tenant helpers, INSERTs and tables without a tenant column pass", async () => {
    const out = await run(edge02D1TenantPredicate, {
      ...PII_SQL,
      ...wrangler,
      "src/w.ts": [
        'await env.DB.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").bind(id, uid).first();',
        'await tenantDb(env, uid).prepare("SELECT * FROM notes WHERE id = ?").first();',
        'await env.DB.prepare("INSERT INTO notes (id, user_id, body) VALUES (?, ?, ?)").run();',
        'await env.DB.prepare("SELECT * FROM people WHERE id = ?").first();',
      ].join("\n"),
    });
    expect(out).toEqual([]);
  });
  test("libSQL execute/batch on a tenant table without the predicate fires", async () => {
    const out = await run(edge02D1TenantPredicate, {
      ...PII_SQL,
      "src/l.ts": [
        'await client.execute({ sql: "DELETE FROM notes WHERE id = ?", args: [id] });',
        'await client.batch(["UPDATE notes SET body = ? WHERE id = ?"]);',
      ].join("\n"),
    });
    expect(out).toEqual(["src/l.ts:1 CRITICAL", "src/l.ts:2 CRITICAL"]);
  });
  test("no D1 binding or libSQL dependency → skipped", async () => {
    expect(
      await run(edge02D1TenantPredicate, { "package.json": "{}", ...PII_SQL, "src/w.ts": 'await env.DB.prepare("SELECT * FROM notes WHERE id = ?").first();' }),
    ).toEqual([]);
  });
});
