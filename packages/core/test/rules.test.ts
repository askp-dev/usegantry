import { beforeAll, describe, expect, test } from "bun:test";
import { buildRepoContext } from "../src/context/builder";
import type { Finding, RepoContext } from "../src/context/types";
import { ALL_STATIC_RULES } from "../src/rules/index";

const VULN = "fixtures/vulnerable-saas";
const CLEAN = "fixtures/clean-saas";
const BAAS = "fixtures/vulnerable-baas";
/** Rules whose positive cases live in the BaaS/edge sibling fixture (Convex, Firestore, Mongo, D1, Turso). */
const ON_BAAS = new Set(["BAAS-01", "BAAS-02", "BAAS-03", "EDGE-01", "EDGE-02"]);

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
  "BAAS-03": [
    ["server/routes.js", "req.body.password"],
    ["server/routes.js", "Note.find(filter)"],
  ],
  "EDGE-01": [["lib/replica.ts", "createClient"]],
  "EDGE-02": [["worker/src/index.ts", 'WHERE id = ?")']],
};

let vuln: RepoContext;
let clean: RepoContext;
let baas: RepoContext;
const vulnOut = new Map<string, Finding[]>();
const cleanOut = new Map<string, Finding[]>();

beforeAll(async () => {
  vuln = await buildRepoContext(VULN, { config: { offline: true } });
  clean = await buildRepoContext(CLEAN, { config: { offline: true } });
  baas = await buildRepoContext(BAAS, { config: { offline: true } });
  await Promise.all(ALL_STATIC_RULES.map(async (r) => vulnOut.set(r.id, await r.run(ON_BAAS.has(r.id) ? baas : vuln))));
  await Promise.all(ALL_STATIC_RULES.map(async (r) => cleanOut.set(r.id, await r.run(clean))));
});

test("registry has 49 unique rules covering every expectation", () => {
  const ids = ALL_STATIC_RULES.map((r) => r.id);
  expect(ids.length).toBe(49);
  expect(new Set(ids).size).toBe(49);
  expect(Object.keys(EXPECT).sort()).toEqual([...ids].sort());
});

for (const rule of ALL_STATIC_RULES) {
  describe(rule.id, () => {
    test(`fires on ${ON_BAAS.has(rule.id) ? BAAS : VULN}`, () => {
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
    test(`is silent on ${CLEAN}`, () => {
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
