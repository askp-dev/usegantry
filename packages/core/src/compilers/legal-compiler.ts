import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SUBPROCESSOR_MAP_VERSION } from "../context/knowledge";
import type { DetectedSubprocessor, LegalClause, LegalManifest, RepoContext } from "../context/types";
import { requireFeature } from "../entitlements";
import { USER_TABLE_RE } from "../rules/helpers";
import { unifiedDiff } from "./diff";
import { AUTO_BLOCKS, type AutoBlock, TEMPLATES } from "./legal-templates";

const PII_CATEGORIES: Array<[string, RegExp]> = [
  ["Contact details", /email|phone|mobile/i],
  ["Identity", /name|dob|birth|gender|avatar|photo|username/i],
  ["Location", /address|street|city|zip|postal|country|lat|lng|geo/i],
  ["Online identifiers", /ip|device|user_?agent|cookie|session/i],
  ["Government / tax identifiers", /ssn|tax|passport|national|license/i],
  ["Financial", /iban|card|account_number|routing|stripe|billing/i],
];

export function stackHash(subs: DetectedSubprocessor[], pii: LegalManifest["piiCategories"], clauses: LegalClause[]): string {
  const canon = JSON.stringify({
    s: subs.map((s) => s.id).sort(),
    p: pii.map((p) => p.category).sort(),
    c: clauses
      .filter((c) => c.enabled)
      .map((c) => c.id)
      .sort(),
  });
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

export function legalVersionPath(ctx: RepoContext): string {
  return ctx.files.all.some((f) => f.startsWith("src/")) ? "src/lib/legal-version.ts" : "lib/legal-version.ts";
}

/** Reads `CURRENT_LEGAL_VERSION` / `LEGAL_STACK_HASH` from the generated module, if present. */
export function readLegalVersion(ctx: RepoContext): { version: string; hash: string } | null {
  const t = ctx.getText(legalVersionPath(ctx));
  const v = /CURRENT_LEGAL_VERSION\s*=\s*["']([^"']+)/.exec(t)?.[1];
  const h = /LEGAL_STACK_HASH\s*=\s*["']([^"']+)/.exec(t)?.[1];
  return v && h ? { version: v, hash: h } : null;
}

/** Stack hash recorded in a document's VERSION_META block. */
export function docStackHash(text: string): string | null {
  return /PREFLIGHT:AUTO:VERSION_META[\s\S]*?Stack hash:\s*`([0-9a-f]+)`/.exec(text)?.[1] ?? null;
}

export function buildLegalManifest(ctx: RepoContext, now = new Date()): LegalManifest {
  const seen = new Set<string>();
  const subprocessors = ctx.detectedSubprocessors.filter((s) => !seen.has(s.id) && seen.add(s.id));
  const cats = new Map<string, { fields: Set<string>; tables: Set<string> }>();
  for (const t of ctx.dbTables.values()) {
    for (const c of t.columns) {
      if (!c.isPII) continue;
      const cat = PII_CATEGORIES.find(([, re]) => re.test(c.name))?.[0] ?? "Other personal data";
      const e = cats.get(cat) ?? { fields: new Set(), tables: new Set() };
      e.fields.add(c.name);
      e.tables.add(t.name);
      cats.set(cat, e);
    }
  }
  const piiCategories = [...cats]
    .map(([category, e]) => ({ category, fields: [...e.fields].sort(), tables: [...e.tables].sort() }))
    .sort((a, b) => a.category.localeCompare(b.category));
  const has = (re: RegExp) => subprocessors.some((s) => re.test(s.category));
  const cl = ctx.config.clauses;
  const clauses: LegalClause[] = [
    {
      id: "AI_OUTPUT_DISCLAIMER",
      label: "AI output disclaimer & IP schedule",
      enabled: cl.aiOutputDisclaimer && ctx.stack.genAi,
      reason: ctx.stack.genAi ? "GenAI SDK detected" : "No GenAI SDK detected",
    },
    {
      id: "NO_TRAINING_API",
      label: "No training on customer data (API terms)",
      enabled: cl.noTrainingApi && ctx.stack.genAi,
      reason: ctx.stack.genAi ? "Data is sent to AI providers via API" : "No GenAI SDK detected",
    },
    {
      id: "PCI_BILLING_DELEGATION",
      label: "PCI billing delegation",
      enabled: cl.pciBillingDelegation && (ctx.stack.stripe || has(/Payments|Billing/)),
      reason: ctx.stack.stripe || has(/Payments|Billing/) ? "Payment processor detected" : "No payment processor detected",
    },
    {
      id: "GDPR_ERASURE",
      label: "Right to erasure & portability",
      enabled: cl.gdprErasure && [...ctx.dbTables.values()].some((t) => USER_TABLE_RE.test(t.name)),
      reason: "User table detected",
    },
  ];
  const hash = stackHash(subprocessors, piiCategories, clauses);
  const prev = readLegalVersion(ctx);
  const today = now.toISOString().slice(0, 10);
  const version = prev?.hash === hash ? prev.version : prev?.version.startsWith(today) ? `${today}.${Number(prev.version.split(".")[1] ?? 0) + 1}` : today;
  const manifest: LegalManifest = {
    version,
    stackHash: hash,
    generatedAt: now.toISOString(),
    jurisdiction: ctx.config.jurisdiction,
    companyName: ctx.config.companyName,
    productName: ctx.config.productName,
    contactEmail: ctx.config.contactEmail,
    subprocessors,
    piiCategories,
    clauses,
    documents: {},
  };
  for (const name of Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>) {
    const rel = `${ctx.config.legalDir}/${name}`;
    manifest.documents[rel] = patchDocument(ctx.getText(rel), name, manifest);
  }
  return manifest;
}

const on = (m: LegalManifest, id: LegalClause["id"]) => m.clauses.find((c) => c.id === id)?.enabled;

export function renderBlock(b: AutoBlock, m: LegalManifest): string {
  switch (b) {
    case "SUBPROCESSORS":
      if (!m.subprocessors.length) return "We don't currently use third-party sub-processors.";
      return [
        "| Sub-processor | Purpose | Data processed | Location | DPA |",
        "|---|---|---|---|---|",
        ...m.subprocessors.map(
          (s) =>
            `| [${s.entityName}](${s.privacyPolicyUrl}) | ${s.category} | ${s.dataProcessed.join(", ")} | ${s.jurisdiction} | ${s.dpaUrl ? `[DPA](${s.dpaUrl})` : "n/a"} |`,
        ),
      ].join("\n");
    case "PII_TABLE":
      if (!m.piiCategories.length) return "We collect only the account data needed to provide the service.";
      return [
        "| Category | Fields | Where it's stored |",
        "|---|---|---|",
        ...m.piiCategories.map((p) => `| ${p.category} | ${p.fields.join(", ")} | ${p.tables.join(", ")} |`),
      ].join("\n");
    case "AI_SCHEDULE":
      return on(m, "AI_OUTPUT_DISCLAIMER")
        ? `**AI output disclaimer.** ${m.productName} uses machine-learning models to generate content. Outputs may be inaccurate, incomplete or offensive and are not professional advice; verify them before relying on them.\n\n**Ownership.** As between you and ${m.companyName || "us"}, you own your inputs and, to the extent permitted by law, the outputs generated for you. Outputs may not be unique, and similar outputs may be generated for others.\n\n**Acceptable use.** You may not use AI features to generate unlawful, harassing or infringing content, impersonate others, or attempt to extract model weights or prompts.`
        : "This product doesn't include generative AI features.";
    case "NO_TRAINING":
      return on(m, "NO_TRAINING_API")
        ? `We send the minimum necessary data to AI providers (${
            m.subprocessors
              .filter((s) => /^AI/.test(s.category))
              .map((s) => s.entityName)
              .join(", ") || "our AI providers"
          }) through their business APIs, whose terms prohibit using that data to train their models.`
        : "We don't send your data to third-party AI model providers.";
    case "PCI":
      return on(m, "PCI_BILLING_DELEGATION")
        ? `Payments are processed by ${
            m.subprocessors
              .filter((s) => /Payments|Billing/.test(s.category))
              .map((s) => s.entityName)
              .join(", ") || "our PCI-DSS compliant payment processor"
          }. We never see or store your full card number.`
        : "We don't process payments.";
    case "ERASURE":
      return on(m, "GDPR_ERASURE")
        ? `You can access, export (Art. 20 GDPR) or delete (Art. 17 GDPR) your personal data at any time from your account settings or by emailing ${m.contactEmail || "us"}. Deletion removes your account data and files within 30 days, except records we must keep by law.`
        : `To exercise your data rights, contact ${m.contactEmail || "us"}.`;
    case "VERSION_META":
      return `Version: ${m.version} · Last updated: ${m.version.slice(0, 10)} · Stack hash: \`${m.stackHash}\``;
  }
}

/** Non-destructive: only text between PREFLIGHT:AUTO markers changes; missing blocks are appended. */
export function patchDocument(existing: string, template: keyof typeof TEMPLATES, m: LegalManifest): string {
  const fill = (s: string) =>
    s
      .replace(/\{\{companyName\}\}/g, m.companyName || "[COMPANY NAME]")
      .replace(/\{\{productName\}\}/g, m.productName || "[PRODUCT NAME]")
      .replace(/\{\{contactEmail\}\}/g, m.contactEmail || "[EMAIL]")
      .replace(/\{\{jurisdiction\}\}/g, m.jurisdiction);
  let doc = existing.trim() ? existing : fill(TEMPLATES[template]);
  for (const b of AUTO_BLOCKS) {
    if (!TEMPLATES[template].includes(`PREFLIGHT:AUTO:${b} `)) continue;
    const content = `<!-- PREFLIGHT:AUTO:${b} -->\n${renderBlock(b, m)}\n<!-- /PREFLIGHT:AUTO:${b} -->`;
    const re = new RegExp(`<!-- PREFLIGHT:AUTO:${b} -->[\\s\\S]*?<!-- /PREFLIGHT:AUTO:${b} -->`);
    doc = re.test(doc) ? doc.replace(re, () => content) : `${doc.trimEnd()}\n\n${content}\n`;
  }
  return doc;
}

export interface LegalChange {
  path: string;
  before: string;
  after: string;
  diff: string;
}

export function compileLegalDocs(ctx: RepoContext, opts: { apply?: boolean; now?: Date } = {}): { manifest: LegalManifest; changes: LegalChange[] } {
  requireFeature("legal");
  const manifest = buildLegalManifest(ctx, opts.now);
  const versionFile = legalVersionPath(ctx);
  const files: Record<string, string> = {
    ...manifest.documents,
    [versionFile]: `// Generated by Preflight (subprocessor map ${SUBPROCESSOR_MAP_VERSION}). Do not edit by hand.\n// Bump forces users to re-accept terms (LEG-03 clickwrap).\nexport const CURRENT_LEGAL_VERSION = "${manifest.version}";\nexport const LEGAL_STACK_HASH = "${manifest.stackHash}";\n`,
  };
  return { manifest, changes: writeChanges(ctx, files, opts.apply) };
}

/** Diff each target against the working tree; write only when `apply`. */
export function writeChanges(ctx: RepoContext, files: Record<string, string>, apply = false): LegalChange[] {
  const changes: LegalChange[] = [];
  for (const [path, after] of Object.entries(files)) {
    const before = ctx.getText(path);
    if (before === after) continue;
    changes.push({ path, before, after, diff: unifiedDiff(before, after, path) });
    if (apply) {
      const abs = join(ctx.rootDir, path);
      if (!existsSync(dirname(abs))) mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, after);
    }
  }
  return changes;
}
