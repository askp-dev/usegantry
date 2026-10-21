import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AI_INVENTORY_END, AI_INVENTORY_PATH, aiInventoryIsCurrent, compileAiInventory } from "../src/compilers/ai-inventory";
import { buildRepoContext } from "../src/context/builder";
import { VENDORS } from "../src/context/knowledge";
import type { RuleDefinition } from "../src/context/types";
import { runAudit } from "../src/engine";
import { FEATURE_TIER, hasFeature } from "../src/entitlements";
import { aia01AiInventory } from "../src/rules/compliance/aia-01-ai-inventory";
import { hipaa02PhiAuditLog } from "../src/rules/compliance/hipaa-02-phi-audit-log";
import { hipaa03SessionIdle } from "../src/rules/compliance/hipaa-03-session-idle";
import { lgl01MatterNamespace } from "../src/rules/compliance/lgl-01-matter-namespace";
import { lgl02LegalHoldCascade } from "../src/rules/compliance/lgl-02-legal-hold-cascade";
import { pci01FloatMoney } from "../src/rules/compliance/pci-01-float-money";
import { pci02LedgerMutation } from "../src/rules/compliance/pci-02-ledger-mutation";
import { assertProfiles, profileSeverity } from "../src/rules/profiles";

const ROOT = join(import.meta.dir, "../../..");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "preflight-comp-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const ctxOf = (root: string, profiles?: string[]) => buildRepoContext(root, { config: { offline: true, profiles } });
const run = async (rule: RuleDefinition, files: Record<string, string>) =>
  (await rule.run(await ctxOf(repo(files)))).map((f) => `${f.file}:${f.line}:${f.severity}`);
const src = (...lines: string[]) => `${lines.join("\n")}\n`;
const PKG = (deps: Record<string, string>) => JSON.stringify({ name: "t", dependencies: deps }, null, 2);

describe("profiles", () => {
  test("unknown profile names are rejected, known ones pass", () => {
    expect(() => assertProfiles(["hipaa", "airgap"])).not.toThrow();
    expect(() => assertProfiles(["hipa"])).toThrow(/Unknown profile "hipa"/);
  });
  test("profile severities only ever raise", () => {
    expect(profileSeverity("VEC-03", "HIGH", ["legal-privilege"])).toBe("CRITICAL");
    expect(profileSeverity("VEC-03", "HIGH", [])).toBe("HIGH");
    expect(profileSeverity("PRIV-03", "MEDIUM", ["airgap", "hipaa"])).toBe("CRITICAL");
    expect(profileSeverity("SEC-01", "CRITICAL", ["hipaa"])).toBe("CRITICAL");
  });
  test("profiles are an agency feature", () => {
    expect(FEATURE_TIER.profiles).toBe("agency");
    expect(hasFeature("profiles", "pro")).toBe(false);
    expect(hasFeature("profiles", "agency")).toBe(true);
  });
  test("runAudit: packs run only under their profile, and stricter severities apply", async () => {
    const root = join(ROOT, "fixtures/vulnerable-compliance");
    const off = await runAudit(await ctxOf(root));
    expect(off.rulesRun).not.toContain("HIPAA-01");
    expect(off.findings.some((f) => f.ruleId === "LEG-06" && f.severity === "CRITICAL")).toBe(false);
    const on = await runAudit(await ctxOf(root, ["hipaa", "eu-ai-act"]));
    expect(on.rulesRun).toContain("HIPAA-01");
    expect(on.rulesRun).toContain("AIA-01");
    expect(on.rulesRun).not.toContain("PCI-01");
    const leg06 = on.findings.find((f) => f.ruleId === "LEG-06");
    expect(leg06?.severity).toBe("CRITICAL");
    expect(leg06?.blocking).toBe(true);
    await expect(runAudit(await ctxOf(root, ["soc2"]))).rejects.toThrow(/Unknown profile/);
  });
  test("every vendor carries the compliance flags (null = unknown)", () => {
    for (const v of VENDORS) for (const k of ["baa", "zdr", "trainsOnData"] as const) expect([true, false, null]).toContain(v[k]);
  });
});

describe("HIPAA", () => {
  test("HIPAA-02: an audit table, an audit trigger or pgaudit clears it", async () => {
    const schema = (extra = "") => `model Patient {\n  id String @id\n  diagnosis String\n}\n${extra}`;
    expect(await run(hipaa02PhiAuditLog, { "prisma/schema.prisma": schema() })).toEqual(["prisma/schema.prisma:1:HIGH"]);
    expect(await run(hipaa02PhiAuditLog, { "prisma/schema.prisma": schema("model PhiAccessLog {\n  id String @id\n}\n") })).toEqual([]);
    expect(await run(hipaa02PhiAuditLog, { "prisma/schema.prisma": schema(), "db/audit.sql": "create extension if not exists pgaudit;\n" })).toEqual([]);
    // Identifiers alone (email, dob) aren't PHI tables.
    expect(await run(hipaa02PhiAuditLog, { "prisma/schema.prisma": "model User {\n  id String @id\n  email String\n}\n" })).toEqual([]);
  });

  test("HIPAA-03: Auth.js default, express-session ms units, iron-session named options, Django, Supabase", async () => {
    const pkg = PKG({ "next-auth": "5.0.0", "express-session": "1.18.0", "iron-session": "8.0.0" });
    expect(
      await run(hipaa03SessionIdle, {
        "package.json": pkg,
        "auth.ts": src('import NextAuth from "next-auth";', "export const { auth } = NextAuth({ providers: [] });"),
      }),
    ).toEqual(["auth.ts:2:HIGH"]);
    expect(
      await run(hipaa03SessionIdle, {
        "package.json": pkg,
        "auth.ts": src('import NextAuth from "next-auth";', "const IDLE = 10 * 60;", "export const { auth } = NextAuth({ session: { maxAge: IDLE } });"),
      }),
    ).toEqual([]);
    // express-session maxAge is milliseconds: 900000 ms = 15 min passes, 3600000 fails.
    const express = (ms: string) => src('import session from "express-session";', `app.use(session({ secret: s, cookie: { maxAge: ${ms} } }));`);
    expect(await run(hipaa03SessionIdle, { "package.json": pkg, "server.ts": express("15 * 60 * 1000") })).toEqual([]);
    expect(await run(hipaa03SessionIdle, { "package.json": pkg, "server.ts": express("60 * 60 * 1000") })).toEqual(["server.ts:2:HIGH"]);
    const iron = (ttl: string) =>
      src(
        'import { getIronSession } from "iron-session";',
        `const sessionOptions = { password: p, cookieName: "s", ttl: ${ttl} };`,
        "export const get = () => getIronSession(cookies(), sessionOptions);",
      );
    expect(await run(hipaa03SessionIdle, { "package.json": pkg, "lib/session.ts": iron("900") })).toEqual([]);
    expect(await run(hipaa03SessionIdle, { "package.json": pkg, "lib/session.ts": iron("86400") })).toEqual(["lib/session.ts:2:HIGH"]);
    expect(await run(hipaa03SessionIdle, { "app/settings.py": src("from django.conf import settings", "SESSION_COOKIE_AGE = 60 * 60") })).toEqual([
      "app/settings.py:2:HIGH",
    ]);
    expect(await run(hipaa03SessionIdle, { "supabase/config.toml": src("[auth.sessions]", 'inactivity_timeout = "15m"') })).toEqual([]);
    expect(await run(hipaa03SessionIdle, { "supabase/config.toml": src("[auth]", "jwt_expiry = 3600") })).toEqual(["supabase/config.toml:1:HIGH"]);
  });
});

describe("fintech-pci", () => {
  test("PCI-01: float money fires (CRITICAL on ledgers), decimals and non-money floats don't", async () => {
    const sql = src(
      "create table ledger_entries (id uuid primary key, amount double precision);",
      "create table products (id uuid primary key, price real, weight real);",
      "create table invoices (id uuid primary key, total numeric(19,4));",
    );
    expect(await run(pci01FloatMoney, { "db/schema.sql": sql })).toEqual(["db/schema.sql:1:CRITICAL", "db/schema.sql:2:HIGH"]);
  });

  test("PCI-02: Prisma/Supabase/raw SQL edits of ledgers; other tables and SQL-looking prose are ignored", async () => {
    const code = src(
      "await prisma.ledgerEntry.updateMany({ where: {}, data: {} });",
      'await supabase.from("transactions").delete().eq("id", id);',
      "await sql`UPDATE journal_entries SET amount = 0 WHERE id = $1`;",
      "await prisma.user.update({ where: { id }, data: {} });",
      'toast("Update transactions list");',
      "await prisma.ledgerEntry.create({ data: {} });",
    );
    expect(await run(pci02LedgerMutation, { "lib/ledger.ts": code })).toEqual(["lib/ledger.ts:1:HIGH", "lib/ledger.ts:2:CRITICAL", "lib/ledger.ts:3:HIGH"]);
  });
});

describe("legal-privilege", () => {
  test("LGL-01: user-scoped search still fires; a matter namespace passes", async () => {
    const pkg = PKG({ "@qdrant/js-client-rest": "1.12.0" });
    const rag = (args: string) =>
      src(
        'import { QdrantClient } from "@qdrant/js-client-rest";',
        "const q = new QdrantClient({ url: u });",
        `export const find = (v, userId, matterId) => q.search(${args});`,
      );
    expect(
      await run(lgl01MatterNamespace, {
        "package.json": pkg,
        "lib/rag.ts": rag('"docs", { vector: v, filter: { must: [{ key: "user_id", match: { value: userId } }] } }'),
      }),
    ).toEqual(["lib/rag.ts:3:CRITICAL"]);
    expect(
      await run(lgl01MatterNamespace, {
        "package.json": pkg,
        "lib/rag.ts": rag('"docs", { vector: v, filter: { must: [{ key: "matter_id", match: { value: matterId } }] } }'),
      }),
    ).toEqual([]);
  });

  test("LGL-02: CRITICAL with a hold flag, HIGH for privileged tables without one, RESTRICT passes", async () => {
    const sql = (action: string) =>
      src(
        "create table matters (id uuid primary key);",
        `create table documents (id uuid primary key, matter_id uuid references matters(id) on delete ${action}, legal_hold boolean default false);`,
        `create table memos (id uuid primary key, matter_id uuid references matters(id) on delete ${action});`,
        `create table sessions (id uuid primary key, matter_id uuid references matters(id) on delete ${action});`,
      );
    expect(await run(lgl02LegalHoldCascade, { "db/schema.sql": sql("cascade") })).toEqual(["db/schema.sql:2:CRITICAL", "db/schema.sql:3:HIGH"]);
    expect(await run(lgl02LegalHoldCascade, { "db/schema.sql": sql("restrict") })).toEqual([]);
  });
});

describe("eu-ai-act", () => {
  const files = {
    "package.json": PKG({ openai: "4.0.0" }),
    "lib/ai.ts": src(
      'import OpenAI from "openai";',
      "const o = new OpenAI();",
      'export const ask = (q) => o.chat.completions.create({ model: "gpt-4o", messages: [{ role: "system", content: "Be brief." }, { role: "user", content: q }] });',
    ),
  };

  test("AI inventory: models + prompts listed, human tail kept, AIA-01 missing → current → stale", async () => {
    const root = repo(files);
    let ctx = await ctxOf(root);
    expect((await aia01AiInventory.run(ctx)).map((f) => f.severity)).toEqual(["HIGH"]);
    const out = compileAiInventory(ctx)[AI_INVENTORY_PATH];
    expect(out).toContain("| `gpt-4o` | lib/ai.ts:3 |");
    expect(out).toContain("- lib/ai.ts:3");
    expect(out).toContain("| openai | OpenAI, L.L.C. | US | yes | no |");
    writeFileSync(join(root, AI_INVENTORY_PATH), out.replace("_describe_", "Every answer is reviewed."));
    ctx = await ctxOf(root);
    expect(aiInventoryIsCurrent(ctx)).toBe(true);
    expect(await aia01AiInventory.run(ctx)).toEqual([]);
    expect(compileAiInventory(ctx)[AI_INVENTORY_PATH]).toContain("Every answer is reviewed.");
    writeFileSync(join(root, "lib/ai.ts"), files["lib/ai.ts"].replace("gpt-4o", "gpt-4.1"));
    ctx = await ctxOf(root);
    expect((await aia01AiInventory.run(ctx)).map((f) => `${f.file}:${f.severity}`)).toEqual([`${AI_INVENTORY_PATH}:MEDIUM`]);
    expect(AI_INVENTORY_END).toContain("preflight:end");
  });

  test("no AI in the repo → no inventory and no finding", async () => {
    const ctx = await ctxOf(repo({ "package.json": PKG({ next: "15.0.0" }) }));
    expect(compileAiInventory(ctx)).toEqual({});
    expect(await aia01AiInventory.run(ctx)).toEqual([]);
  });
});
