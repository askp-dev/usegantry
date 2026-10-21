import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPayload, CertificateBlockedError, canonicalJson, generateCertificate, verifyCertificate } from "../src/compilers/cert-generator";
import { buildChecklist } from "../src/compilers/checklist-writer";
import { unifiedDiff } from "../src/compilers/diff";
import { buildLegalManifest, compileLegalDocs, docStackHash } from "../src/compilers/legal-compiler";
import { renderPdf } from "../src/compilers/pdf";
import { buildDataFlowMermaid, buildSbom, purl } from "../src/compilers/vendor-pack";
import { buildRepoContext } from "../src/context/builder";
import { audit, runAudit } from "../src/engine";
import { toSarif } from "../src/reporters/sarif";

const dirs: string[] = [];
const copy = (fixture: string) => {
  const d = mkdtempSync(join(tmpdir(), "preflight-comp-"));
  dirs.push(d);
  cpSync(fixture, d, { recursive: true });
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const SECRET = { secret: "test-only-cert-secret" };

describe("legal compiler", () => {
  test("manifest reflects detected vendors, PII and clauses", async () => {
    const ctx = await buildRepoContext("fixtures/vulnerable-saas", { config: { offline: true } });
    const m = buildLegalManifest(ctx, new Date("2026-01-02T00:00:00Z"));
    expect(m.subprocessors.map((s) => s.id).sort()).toEqual(["openai", "posthog", "resend", "stripe", "supabase"]);
    expect(m.piiCategories.find((c) => c.category === "Contact details")?.fields).toContain("email");
    expect(m.clauses.find((c) => c.id === "AI_OUTPUT_DISCLAIMER")?.enabled).toBe(true);
    expect(m.stackHash).toMatch(/^[0-9a-f]{16}$/);
    expect(m.version).toBe("2026-01-02");
  });

  test("patches only inside AUTO markers, keeps user text, and fixes LEG-04/LEG-06", async () => {
    const root = copy("fixtures/vulnerable-saas");
    const ctx = await buildRepoContext(root, { config: { offline: true } });
    const { changes, manifest } = compileLegalDocs(ctx, { apply: true });
    expect(changes.map((c) => c.path).sort()).toEqual(["legal/eula.md", "legal/privacy-policy.md", "legal/terms.md", "lib/legal-version.ts"]);
    const policy = readFileSync(join(root, "legal/privacy-policy.md"), "utf8");
    expect(policy).toContain("We use Stripe to process payments."); // user content preserved
    expect(policy).toContain("<!-- PREFLIGHT:AUTO:SUBPROCESSORS -->");
    expect(policy).toContain("OpenAI");
    expect(docStackHash(policy)).toBe(manifest.stackHash);
    expect(readFileSync(join(root, "lib/legal-version.ts"), "utf8")).toContain(`LEGAL_STACK_HASH = "${manifest.stackHash}"`);
    expect(changes.find((c) => c.path === "legal/privacy-policy.md")?.diff).toContain("+| [OpenAI");

    const after = await audit(root, { config: { offline: true }, ruleIds: ["LEG-04", "LEG-06"] });
    expect(after.findings.filter((f) => f.ruleId === "LEG-06" && f.file.endsWith("eula.md"))).toEqual([]);
    expect(after.findings.filter((f) => f.ruleId === "LEG-04")).toEqual([]);

    // idempotent: recompiling an unchanged stack writes nothing
    const again = compileLegalDocs(await buildRepoContext(root, { config: { offline: true } }), { apply: true });
    expect(again.changes).toEqual([]);
    expect(again.manifest.version).toBe(manifest.version);
  });

  test("stale VERSION_META hash triggers LEG-04", async () => {
    const root = copy("fixtures/clean-saas");
    const p = join(root, "legal/privacy-policy.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(/Stack hash: `[0-9a-f]+`/, "Stack hash: `0000000000000000`"));
    const r = await audit(root, { config: { offline: true }, ruleIds: ["LEG-04"] });
    expect(r.findings.map((f) => f.evidence)).toEqual([expect.stringContaining("≠ current stack hash")]);
  });

  test("unified diff", () => {
    expect(unifiedDiff("a\nb\nc", "a\nb\nc", "f")).toBe("");
    const d = unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "f.md");
    expect(d).toContain("--- a/f.md");
    expect(d).toContain("-b\n+B");
    expect(unifiedDiff("", "new\n", "n.md")).toContain("+new");
  });
});

describe("checklist", () => {
  test("rewrites only the auto block", async () => {
    const r = await audit("fixtures/vulnerable-saas", { config: { offline: true } });
    const first = buildChecklist("", r);
    expect(first).toContain("- [ ] **SEC-01**");
    const edited = `# Mine\n\nMy notes stay.\n\n${first.slice(first.indexOf("<!-- PREFLIGHT"))}\nFooter note.\n`;
    const clean = await audit("fixtures/clean-saas", { config: { offline: true } });
    const next = buildChecklist(edited, clean);
    expect(next).toContain("My notes stay.");
    expect(next).toContain("Footer note.");
    expect(next).toContain("- [x] **SEC-01**");
    expect(next).not.toContain("- [ ] **SEC-01**");
  });
});

describe("certificate", () => {
  test("refuses while there are blockers unless --allow-blocked", async () => {
    const root = copy("fixtures/vulnerable-saas");
    const r = await audit(root, { config: { offline: true } });
    expect(() => generateCertificate(r, { outDir: root, ...SECRET })).toThrow(CertificateBlockedError);
    const res = generateCertificate(r, { outDir: root, allowBlocked: true, ...SECRET });
    expect(readFileSync(res.html, "utf8")).toContain("BLOCKED");
  });

  test("signature verifies, tampering fails, PDF is well-formed", async () => {
    const root = copy("fixtures/clean-saas");
    const r = await audit(root, { config: { offline: true } });
    const res = generateCertificate(r, { outDir: root, ...SECRET });
    expect(res.payload.overallScore).toBe(100);
    expect(res.payload.passedRules.length).toBe(39);
    const fragment = res.url.split("#")[1];
    expect(verifyCertificate(fragment, res.publicKey)?.overallScore).toBe(100);
    const [body, sig] = fragment.split(".");
    const forged = Buffer.from(Buffer.from(body, "base64url").toString().replace('"overallScore":100', '"overallScore":99')).toString("base64url");
    expect(verifyCertificate(`${forged}.${sig}`, res.publicKey)).toBeNull();
    // same secret → same key → stable public key
    expect(generateCertificate(r, { outDir: root, ...SECRET }).publicKey).toBe(res.publicKey);
    const pdf = readFileSync(res.pdf, "latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    for (const m of pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)) expect(pdf.slice(Number(m[1])).match(/^\d+ 0 obj/)).not.toBeNull();
  });

  test("canonical JSON sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  test("payload lists failed rules", async () => {
    const r = await audit("fixtures/vulnerable-saas", { config: { offline: true } });
    expect(buildPayload(r).failedRules.length).toBe(39);
  });

  test("renderPdf escapes parentheses", () => {
    expect(Buffer.from(renderPdf([{ kind: "text", x: 1, y: 1, size: 9, text: "a (b) \\ c" }])).toString("latin1")).toContain("(a \\(b\\) \\\\ c) Tj");
  });
});

describe("vendor pack & SARIF", () => {
  test("CycloneDX 1.5 SBOM with purls, licenses and services", async () => {
    const ctx = await buildRepoContext("fixtures/vulnerable-saas", { config: { offline: true } });
    const sbom = buildSbom(ctx) as any;
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    const supa = sbom.components.find((c: any) => c.name === "@supabase/supabase-js");
    expect(supa.purl).toBe("pkg:npm/%40supabase/supabase-js@2.45.0");
    expect(supa.licenses).toEqual([{ license: { id: "MIT" } }]);
    expect(sbom.components.find((c: any) => c.name === "prisma").scope).toBe("optional");
    expect(sbom.services.map((s: any) => s.name)).toContain("OpenAI, L.L.C.");
    expect(purl({ name: "Django", version: ">=4.2", isDirect: true, existsInRegistry: true, ecosystem: "pypi" })).toBe("pkg:pypi/django@4.2");
  });

  test("mermaid RoPA and SARIF", async () => {
    const ctx = await buildRepoContext("fixtures/vulnerable-saas", { config: { offline: true } });
    const r = await runAudit(ctx);
    const mm = buildDataFlowMermaid(r);
    expect(mm.startsWith("flowchart LR")).toBe(true);
    expect(mm).toContain('subgraph vendor["Sub-processors"]');
    expect(mm).toContain("-.->");
    const sarif = toSarif(r) as any;
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.rules.length).toBe(39);
    expect(sarif.runs[0].results.length).toBe(r.findings.length);
    expect(sarif.runs[0].results[0]).toMatchObject({ level: "error", locations: [{ physicalLocation: { region: { startLine: expect.any(Number) } } }] });
  });
});
