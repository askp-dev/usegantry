import { beforeAll, describe, expect, test } from "bun:test";
import { buildRepoContext } from "../src/context/builder";
import { sysLangUnavailable } from "../src/context/systems-lang";
import type { Finding, RepoContext } from "../src/context/types";
import { ALL_STATIC_RULES } from "../src/rules/index";

const VULN = "fixtures/vulnerable-saas";
const CLEAN = "fixtures/clean-saas";
const BAAS = "fixtures/vulnerable-baas";
/** Rules whose positive cases live in the BaaS/edge sibling fixture (Convex, Firestore, Mongo, D1, Turso). */
const ON_BAAS = new Set(["BAAS-01", "BAAS-02", "BAAS-03", "EDGE-01", "EDGE-02"]);
const INFRA = "fixtures/vulnerable-infra";
const CLEAN_INFRA = "fixtures/clean-infra";
/** Rules whose positive cases live in the infra/client sibling fixture (compose, Dockerfile, Tauri, Expo); each must also be silent on its clean twin. */
const ON_INFRA = new Set(["IAC-01", "IAC-02", "SOV-01", "CLIENT-01", "CLIENT-02"]);
const FASTAPI = "fixtures/vulnerable-fastapi";
const CLEAN_FASTAPI = "fixtures/clean-fastapi";
/** Python rules: positive cases in the FastAPI sibling fixture, held silent on its clean twin too. */
const ON_PY = new Set(["PY-01", "PY-02", "PY-03", "PY-04"]);
const COMPLIANCE = "fixtures/vulnerable-compliance";
const CLEAN_COMPLIANCE = "fixtures/clean-compliance";
/** Compliance-profile rules (hipaa, fintech-pci, legal-privilege, eu-ai-act): positive cases in their own fixture, held silent on its clean twin. */
const ON_COMP = new Set(["HIPAA-01", "HIPAA-02", "HIPAA-03", "PCI-01", "PCI-02", "PCI-03", "LGL-01", "LGL-02", "LGL-03", "AIA-01"]);
/** Go/Rust rules: positives across the Go and Rust fixtures, silent on both clean twins. Skipped (not failed) without the optional ast-grep grammars. */
const ON_SYS = new Set(["SYS-01", "SYS-02", "SYS-03"]);
const HAS_SYS = !sysLangUnavailable("go") && !sysLangUnavailable("rust");
const vulnRoot = (id: string) =>
  ON_BAAS.has(id)
    ? BAAS
    : ON_INFRA.has(id)
      ? INFRA
      : ON_PY.has(id)
        ? FASTAPI
        : ON_COMP.has(id)
          ? COMPLIANCE
          : ON_SYS.has(id)
            ? "fixtures/vulnerable-go + vulnerable-rust"
            : VULN;
const cleanTwin = (id: string) =>
  ON_INFRA.has(id)
    ? CLEAN_INFRA
    : ON_PY.has(id)
      ? CLEAN_FASTAPI
      : ON_COMP.has(id)
        ? CLEAN_COMPLIANCE
        : ON_SYS.has(id)
          ? "fixtures/clean-go + clean-rust"
          : undefined;

/** What each rule must report on the vulnerable fixture: [file, evidence substring]. */
const EXPECT: Record<string, Array<[string, string]>> = {
  "SEC-01": [
    ["supabase/migrations/20240101000000_init.sql", "using (true)"],
    ["supabase/migrations/20240101000000_init.sql", "raw_user_meta_data"],
    ["supabase/migrations/20240101000000_init.sql", "documents"],
    ["supabase/migrations/20240101000000_init.sql", "0 policies"],
    ["prisma/schema.prisma", "users"],
  ],
  "SEC-02": [
    ["supabase/migrations/20240101000000_init.sql", "document_stats"],
    ["supabase/migrations/20240101000000_init.sql", "search_path"],
  ],
  "SEC-03": [
    ["app/actions.ts", "prisma.post.delete"],
    ["app/actions.ts", "prisma.post.update"],
    ["app/api/posts/[id]/route.ts", "params.id"],
    ["app/api/chat/route.ts", "body.userId"],
  ],
  "SEC-04": [
    ["supabase/migrations/20240101000000_init.sql", "user-uploads"],
    ["supabase/migrations/20240101000000_init.sql", "Anyone can upload"],
  ],
  "SEC-05": [[".env.local", "NEXT_PUBLIC_OPENAI_API_KEY"]],
  "SEC-06": [
    [".env.local", "Stripe Live Secret Key"],
    [".env.local", "Database URL with Password"],
  ],
  "SEC-07": [
    ["app/actions.ts", "deletePost"],
    ["app/actions.ts", "updateProfile"],
    ["app/actions.ts", "renamePost(): the auth result is never checked"],
    ["app/api/posts/route.ts", "POST /api/posts"],
    ["app/api/chat/route.ts", "POST /api/chat"],
  ],
  "SEC-08": [["app/api/webhook/route.ts", "req.json()"]],
  "SEC-09": [["app/api/chat/route.ts", "rate limiting"]],
  "SEC-10": [
    ["app/actions.ts", "data });"],
    ["app/api/posts/route.ts", "data: body"],
  ],
  "SEC-11": [
    ["app/api/proxy/route.ts", "fetch(target)"],
    ["app/api/proxy/route.ts", "redirect("],
  ],
  "SEC-12": [
    ["app/api/posts/route.ts", "$queryRawUnsafe"],
    ["app/page.tsx", "dangerouslySetInnerHTML"],
    ["components/Markdown.tsx", "dangerouslySetInnerHTML"],
  ],
  "MCP-01": [
    [".mcp.json", "GitHub Personal Access Token"],
    [".cursor/mcp.json", "headers.Authorization"],
    [".vscode/mcp.json", "args[2]"],
    [".claude/settings.json", "env.OPENAI_API_KEY"],
  ],
  "MCP-02": [
    [".mcp.json", "server-github` isn't pinned"],
    [".mcp.json", "likely typosquat"],
    [".vscode/mcp.json", "mcp-server-fetch"],
  ],
  "VEC-01": [["app/api/rag/route.ts", 'qdrant.search("documents"']],
  "VEC-02": [
    ["lib/vector.ts", "new QdrantClient"],
    ["docker-compose.yml", '"6333:6333"'],
  ],
  "VEC-03": [["app/api/ingest/route.ts", "`email`"]],
  "CACHE-01": [["app/api/rag/route.ts", '"rag_last_results"']],
  "CACHE-02": [["app/api/rag/route.ts", "Date.now()"]],
  "PRIV-01": [["app/api/chat/route.ts", 'console.log("chat request", body)']],
  "PRIV-02": [
    ["supabase/migrations/20240101000000_init.sql", "documents.owner_id"],
    ["prisma/schema.prisma", "Post.authorId"],
    ["prisma/schema.prisma", "no account-deletion"],
  ],
  "PRIV-03": [
    ["supabase/migrations/20240101000000_init.sql", "integrations.access_token"],
    ["supabase/migrations/20240101000000_init.sql", "integrations.refresh_token"],
  ],
  "PRIV-04": [["app/layout.tsx", "posthog.init"]],
  "PRIV-05": [["app/api/chat/route.ts", "chat.completions.create"]],
  "PRIV-06": [["supabase/migrations/20240101000000_init.sql", "user-scoped PII tables"]],
  "PRIV-07": [["next.config.js", "Strict-Transport-Security"]],
  "LEG-01": [["package.json", "axois"]],
  "LEG-02": [["package.json", "ffmpeg-static"]],
  "LEG-03": [
    ["prisma/schema.prisma", "accepted_terms_at"],
    ["app/signup.tsx", "pre-checked"],
  ],
  "LEG-04": [
    ["legal/privacy-policy.md", "OpenAI"],
    ["legal/privacy-policy.md", "PostHog"],
    ["legal/privacy-policy.md", "Supabase"],
    ["legal/privacy-policy.md", "Resend"],
  ],
  "LEG-05": [
    ["app/layout.tsx", "/privacy"],
    ["app/layout.tsx", "/terms"],
    ["legal/privacy-policy.md", "[COMPANY NAME]"],
  ],
  "LEG-06": [["package.json", "eula.md"]],
  "FIN-01": [["app/page.tsx", "useEffect"]],
  "FIN-02": [["app/api/chat/route.ts", "streamText"]],
  "FIN-03": [["app/api/posts/route.ts", "findMany"]],
  "PAY-01": [["app/api/webhook/route.ts", "increment"]],
  "PAY-02": [["app/api/credits/route.ts", "user.credits - 1"]],
  "PAY-03": [["app/api/webhook/route.ts", "customer.subscription.deleted"]],
  "OPS-01": [["app/actions.ts", "no GET /api/health"]],
  "OPS-02": [[".env.local", ":5432"]],
  "OPS-03": [["app/api/posts/route.ts", "catch (e)"]],
  "OPS-04": [
    [".env.example", "OPENAI_API_KEY"],
    [".env.example", "no boot-time schema"],
  ],
  "A11Y-01": [
    ["app/page.tsx", "<div onClick"],
    ["app/page.tsx", "<img"],
    ["app/page.tsx", "<input"],
  ],
  "SEO-01": [["app/layout.tsx", "robots.txt"]],
  "BAAS-01": [
    ["convex/notes.ts", "export const list = query"],
    ["convex/notes.ts", "export const remove = mutation"],
    ["convex/notes.ts", "stripeWebhook"],
  ],
  "BAAS-02": [
    ["firestore.rules", "{document=**}"],
    ["firestore.rules", "profiles/{uid}"],
  ],
  "IAC-01": [
    ["docker-compose.yml", "postgres:16-alpine"],
    ["docker-compose.yml", "6379:6379"],
    ["docker-compose.yml", "published: 27017"],
  ],
  "IAC-02": [
    ["Dockerfile", "no USER instruction"],
    ["docker-compose.yml", "docker.sock"],
  ],
  "SOV-01": [
    ["package.json", "next@"],
    ["package.json", "chromadb@"],
    ["package.json", "posthog-js@"],
    [".env", "LANGCHAIN_TRACING_V2=true"],
    ["app/layout.tsx", "next/font/google"],
    ["app/layout.tsx", "fonts.googleapis.com"],
    ["public/widget.html", "cdn.jsdelivr.net"],
  ],
  "CLIENT-01": [
    ["src-tauri/tauri.conf.json", '"all": true'],
    ["src-tauri/tauri.conf.json", "$HOME/**"],
    ["src-tauri/tauri.conf.json", '"args": true'],
    ["src-tauri/capabilities/default.json", "https://*.example.com"],
    ["src-tauri/capabilities/default.json", "fs:allow-home-read-recursive"],
    ["src-tauri/capabilities/default.json", '"cmd": "sh"'],
  ],
  "CLIENT-02": [
    ["mobile/lib/auth.ts", 'setItem("access_token"'],
    ["mobile/lib/auth.ts", "storage: AsyncStorage"],
  ],
  "BAAS-03": [
    ["server/routes.js", "req.body.password"],
    ["server/routes.js", "Note.find(filter)"],
  ],
  "EDGE-01": [["lib/replica.ts", "createClient"]],
  "EDGE-02": [["worker/src/index.ts", 'WHERE id = ?")']],
  "PY-01": [
    ["app/ml.py", "torch.load(path)"],
    ["app/ml.py", "Loader=yaml.Loader"],
    ["app/ml.py", "pickle.loads(raw)"],
    ["app/ml.py", "weights_only=False"],
  ],
  "PY-02": [
    ["app/main.py", "requests.get("],
    ["app/main.py", "time.sleep(1)"],
    ["app/main.py", "client.chat.completions.create"],
    ["app/main.py", "db.query(Order)"],
  ],
  "PY-03": [
    ["app/agent.py", "PythonREPLTool()"],
    ["app/agent.py", "allow_dangerous_code=True"],
  ],
  "PY-04": [
    ["app/chat.py", "tags=[]"],
    ["app/chat.py", "ConversationBufferMemory()"],
    ["app/chat.py", "chat_histories = {}"],
  ],
  "HIPAA-01": [
    ["package.json", "@sendgrid/mail"],
    ["package.json", "mixpanel"],
  ],
  "HIPAA-02": [["prisma/schema.prisma", "Patient (diagnosis, medications)"]],
  "HIPAA-03": [["auth.ts", "maxAge: 30 * 24 * 60 * 60"]],
  "PCI-01": [["prisma/schema.prisma", "LedgerEntry.amount: Float"]],
  "PCI-02": [
    ["app/api/ledger/[id]/route.ts", "prisma.ledgerEntry.update"],
    ["app/api/ledger/[id]/route.ts", "prisma.ledgerEntry.delete"],
  ],
  "PCI-03": [["app/api/transfers/route.ts", "export async function POST"]],
  "LGL-01": [["lib/rag.ts", "index.query"]],
  "LGL-02": [
    ["prisma/schema.prisma", "Document.matterId → Matter ON DELETE CASCADE (and Document.legalHold exists)"],
    ["prisma/schema.prisma", "Correspondence has no legal-hold flag"],
  ],
  "LGL-03": [["package.json", "@ai-sdk/deepseek"]],
  "AIA-01": [["package.json", "AI_INVENTORY.md not found"]],
  "SYS-01": [
    ["handlers/orders.go", "go sendReceipt("],
    ["handlers/orders.go", "go push(id)"],
    ["src/main.rs", "tokio::spawn("],
    ["src/legacy.rs", "actix_rt::spawn("],
  ],
  "SYS-02": [
    ["src/main.rs", "id.parse().unwrap()"],
    ["src/main.rs", '.expect("name is required")'],
    ["src/main.rs", 'headers.get("x-token").unwrap()'],
    ["src/legacy.rs", 'req.match_info().get("n").unwrap()'],
  ],
  "SYS-03": [
    ["handlers/orders.go", "context.Background()"],
    ["internal/admin.go", "context.TODO()"],
  ],
};

let vuln: RepoContext;
let clean: RepoContext;
let baas: RepoContext;
let infra: RepoContext;
let cleanInfra: RepoContext;
let fastapi: RepoContext;
let cleanFastapi: RepoContext;
let compliance: RepoContext;
let cleanCompliance: RepoContext;
const vulnOut = new Map<string, Finding[]>();
const cleanOut = new Map<string, Finding[]>();

beforeAll(async () => {
  vuln = await buildRepoContext(VULN, { config: { offline: true } });
  clean = await buildRepoContext(CLEAN, { config: { offline: true } });
  baas = await buildRepoContext(BAAS, { config: { offline: true } });
  infra = await buildRepoContext(INFRA, { config: { offline: true } });
  cleanInfra = await buildRepoContext(CLEAN_INFRA, { config: { offline: true } });
  fastapi = await buildRepoContext(FASTAPI, { config: { offline: true } });
  cleanFastapi = await buildRepoContext(CLEAN_FASTAPI, { config: { offline: true } });
  compliance = await buildRepoContext(COMPLIANCE, { config: { offline: true } });
  cleanCompliance = await buildRepoContext(CLEAN_COMPLIANCE, { config: { offline: true } });
  if (HAS_SYS) {
    const [goV, rsV, goC, rsC] = await Promise.all(
      ["vulnerable-go", "vulnerable-rust", "clean-go", "clean-rust"].map((f) => buildRepoContext(`fixtures/${f}`, { config: { offline: true } })),
    );
    for (const r of ALL_STATIC_RULES.filter((r) => ON_SYS.has(r.id))) {
      vulnOut.set(r.id, [...(await r.run(goV)), ...(await r.run(rsV))]);
      cleanOut.set(r.id, [...(await r.run(clean)), ...(await r.run(goC)), ...(await r.run(rsC))]);
    }
  }
  const vulnCtx = (id: string) => (ON_BAAS.has(id) ? baas : ON_INFRA.has(id) ? infra : ON_PY.has(id) ? fastapi : ON_COMP.has(id) ? compliance : vuln);
  const rest = ALL_STATIC_RULES.filter((r) => !ON_SYS.has(r.id));
  await Promise.all(rest.map(async (r) => vulnOut.set(r.id, await r.run(vulnCtx(r.id)))));
  // Profile-only rules (SOV-01) never run on clean-saas without their profile, so they're held to the clean twin instead.
  await Promise.all(rest.map(async (r) => cleanOut.set(r.id, r.profiles ? [] : await r.run(clean))));
  await Promise.all([...ON_INFRA].map(async (id) => cleanOut.get(id)!.push(...(await ALL_STATIC_RULES.find((r) => r.id === id)!.run(cleanInfra)))));
  await Promise.all([...ON_PY].map(async (id) => cleanOut.get(id)!.push(...(await ALL_STATIC_RULES.find((r) => r.id === id)!.run(cleanFastapi)))));
  await Promise.all([...ON_COMP].map(async (id) => cleanOut.get(id)!.push(...(await ALL_STATIC_RULES.find((r) => r.id === id)!.run(cleanCompliance)))));
});

test("registry has 71 unique rules covering every expectation", () => {
  const ids = ALL_STATIC_RULES.map((r) => r.id);
  expect(ids.length).toBe(71);
  expect(new Set(ids).size).toBe(71);
  expect(Object.keys(EXPECT).sort()).toEqual([...ids].sort());
});

for (const rule of ALL_STATIC_RULES) {
  describe.skipIf(ON_SYS.has(rule.id) && !HAS_SYS)(rule.id, () => {
    test(`fires on ${vulnRoot(rule.id)}`, () => {
      const fs = vulnOut.get(rule.id)!;
      for (const [file, needle] of EXPECT[rule.id]) {
        const hit = fs.find((f) => f.file === file && (f.evidence.includes(needle) || f.impact.includes(needle)));
        expect(
          hit,
          `${rule.id} should report ${file} containing "${needle}"; got:\n${fs.map((f) => `${f.file}:${f.line} ${f.evidence}`).join("\n")}`,
        ).toBeDefined();
      }
      for (const f of fs) {
        expect(f.ruleId).toBe(rule.id);
        expect(f.pillar).toBe(rule.pillar);
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.impact.length).toBeGreaterThan(20);
        expect(f.agentRemediationPrompt.length).toBeGreaterThan(20);
        expect(f.line).toBeGreaterThanOrEqual(1);
        expect(f.blocking).toBe(f.severity === "CRITICAL");
      }
    });
    test(`is silent on ${[CLEAN, cleanTwin(rule.id)].filter(Boolean).join(" + ")}`, () => {
      const fs = cleanOut.get(rule.id)!;
      expect(fs.map((f) => `${f.file}:${f.line} ${f.evidence}`)).toEqual([]);
    });
  });
}

test("secrets are never echoed in full", () => {
  for (const f of [...vulnOut.get("SEC-05")!, ...vulnOut.get("SEC-06")!, ...vulnOut.get("OPS-02")!]) {
    expect(f.evidence).not.toMatch(/sk_live_[0-9a-zA-Z]{20,}|sk-proj-[A-Za-z0-9_-]{40,}|whsec_[0-9a-zA-Z]{24,}/);
    expect(f.evidence).not.toMatch(/postgres(?:ql)?:\/\/[^:]+:(?!\*\*\*\*)[^@]+@/);
  }
});
