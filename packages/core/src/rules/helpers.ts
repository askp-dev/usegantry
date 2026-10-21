/** Shared plumbing for static rules: finding factory, suppression, taint & route helpers. */
import { createHash } from "node:crypto";
import type { CodeIndex, FnInfo } from "../context/code-index";
import { vendorById } from "../context/knowledge";
import type { Finding, Pillar, RepoContext, RouteNode, RuleDefinition, Severity } from "../context/types";

export type FindingInput = Omit<Finding, "ruleId" | "pillar" | "severity" | "blocking" | "title" | "fingerprint"> & {
  severity?: Severity;
  title?: string;
};
export type Emit = (p: FindingInput) => void;
type Meta = { id: string; pillar: Pillar; severity: Severity; title: string; scope?: "file" | "repo" };

export const isBlocking = (sev: Severity, strict = false) => sev === "CRITICAL" || (strict && sev === "HIGH");

export function fingerprint(ruleId: string, file: string, evidence: string): string {
  return createHash("sha1")
    .update(`${ruleId}\0${file}\0${evidence.replace(/\s+/g, " ").trim()}`)
    .digest("hex")
    .slice(0, 16);
}

export function makeFinding(rule: Meta, p: FindingInput, strict = false): Finding {
  const severity = p.severity ?? rule.severity;
  return {
    ...p,
    ruleId: rule.id,
    pillar: rule.pillar,
    severity,
    blocking: isBlocking(severity, strict),
    title: p.title ?? rule.title,
    line: Math.max(1, p.line || 1),
    evidence: p.evidence.length > 1200 ? `${p.evidence.slice(0, 1200)}…` : p.evidence,
    fingerprint: fingerprint(rule.id, p.file, p.evidence),
  };
}

/** Define a rule whose body pushes findings through `emit`. */
export function defineRule(meta: Meta, body: (ctx: RepoContext, emit: Emit) => void | Promise<void>): RuleDefinition {
  return {
    ...meta,
    async run(ctx) {
      const out: Finding[] = [];
      await body(ctx, (p) => out.push(makeFinding(meta, p, ctx.config.strict)));
      return out;
    },
  };
}

/** `// preflight-ignore SEC-03` (any comment syntax) on the finding's line or the line above, or config.ignoreRules. */
export function isSuppressed(ctx: RepoContext, f: Finding): boolean {
  if (ctx.config.ignoreRules.includes(f.ruleId)) return true;
  const lines = ctx.getText(f.file).split("\n");
  const re = new RegExp(`preflight-ignore\\b[^\\n]*\\b${f.ruleId}\\b`);
  return [f.line - 1, f.line - 2].some((i) => i >= 0 && re.test(lines[i] ?? ""));
}

// ── text helpers ─────────────────────────────────────────────────────────────
export const lineAt = (text: string, pos: number) => text.slice(0, pos).split("\n").length;
/** Never print a live secret: keep a short prefix, mask the rest. */
export const redact = (s: string) => (s.length <= 8 ? "****" : `${s.slice(0, Math.min(8, Math.floor(s.length / 4)))}…[redacted ${s.length} chars]`);
export const redactUrl = (s: string) => s.replace(/(\/\/[^:/\s@]+:)[^@\s]+@/, "$1****@");

// ── route / function helpers ─────────────────────────────────────────────────
export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "SERVER_ACTION"]);

/** Handler body of a route as a [start,end) range in its CodeIndex. */
export function routeBody(ctx: RepoContext, r: RouteNode): { ci: CodeIndex; a: number; b: number; fn?: FnInfo } {
  const ci = ctx.getCode(r.file);
  const a = r.bodyStart ?? 0;
  const b = r.bodyEnd ?? ci.text.length;
  const fn = ci.functions().find((f) => f.bodyStart === a);
  return { ci, a, b, fn };
}

export const WEBHOOK_URL_RE = /webhook|\/hooks?\b|stripe\/events|\/callback\/(stripe|paddle|lemon)/i;
export function isWebhookRoute(ctx: RepoContext, r: RouteNode): boolean {
  if (r.method !== "POST") return false;
  if (WEBHOOK_URL_RE.test(r.urlPath)) return true;
  const { ci, a, b } = routeBody(ctx, r);
  const body = ci.slice(a, b, "noComments");
  return (
    /stripe-signature|svix-|webhook-signature|x-signature|paddle-signature/i.test(body) ||
    (/\bevent\.type\b/.test(body) && ci.importsFrom(/^(stripe|svix|@clerk\/|@lemonsqueezy|@paddle)/).length > 0)
  );
}

/** Expressions that carry attacker-controlled input. */
export const USER_INPUT_RE =
  /\breq\.(?:body|query|params|url|json|formData|text)\b|\brequest\.(?:body|query|params|url|json|form|formData|query_params|path_params|args|get_json)\b|\bsearchParams\b|\bformData\b|\bFormData\b|\bparams\.\w+|\bevent\.(?:request|url|params)\b|\bctx\.(?:request\.body|query|params)\b|\binput\.\w+|\bObject\.fromEntries\s*\(/;
export const VALIDATION_RE =
  /\.(?:parse|safeParse|parseAsync|safeParseAsync|validate|validateSync|pick|omit)\s*\(|\bvalidator\.|\bplainToInstance\b|\bschema\.\w+\(|\bparse_obj\b|\bmodel_validate\b/;

/**
 * Variables in fn body (or whole file when no fn) that hold raw user input. Server-action params are
 * treated as tainted (they're POSTed by the client). Propagates through plain re-assignment twice.
 */
export function taintedVars(ci: CodeIndex, a: number, b: number, extraSources: string[] = [], sourceRe = USER_INPUT_RE): Set<string> {
  const tainted = new Set(extraSources);
  const seg = ci.slice(a, b, "noComments");
  const decls = [...seg.matchAll(/\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[\w$]+)\s*(?::[^=]+)?=\s*([^;\n]+)/g)];
  for (let pass = 0; pass < 3; pass++) {
    for (const [, lhs, rhs] of decls) {
      if (sourceRe === USER_INPUT_RE && VALIDATION_RE.test(rhs)) continue;
      if (!sourceRe.test(rhs) && !refersTo(rhs, tainted)) continue;
      for (const name of lhs.match(/[A-Za-z_$][\w$]*/g) ?? []) tainted.add(name);
    }
  }
  return tainted;
}

/** Parameter names of a function (destructuring flattened). */
export function paramNames(ci: CodeIndex, fn: FnInfo): string[] {
  const raw = ci.slice(fn.paramsStart, fn.paramsEnd + 1, "masked").replace(/:\s*[\w.<>[\]|&\s]+(?=[,)=}])/g, "");
  return (raw.match(/[A-Za-z_$][\w$]*/g) ?? []).filter(
    (n) => !/^(string|number|any|unknown|Request|NextRequest|FormData|Promise|boolean|params|async)$/.test(n),
  );
}

export function refersTo(expr: string, names: Set<string>): boolean {
  for (const n of names) if (new RegExp(`(^|[^\\w$.])${n.replace(/\$/g, "\\$")}\\b`).test(expr)) return true;
  return false;
}

/** Vendors that charge per call (LLM, voice, image, email, SMS). */
export function isPaidVendor(id: string): boolean {
  const v = vendorById(id);
  return !!v && /^AI \/ (LLM|Model|Voice|Speech|Image)|Transactional Email|Marketing Email|SMS/.test(v.category);
}

export const USER_TABLE_RE = /^(users?|profiles?|accounts?|members?|customers?|auth\.users)$/i;
export const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Simple gitignore check (root .gitignore only; good enough for `.env*` coverage). */
export function isGitIgnored(ctx: RepoContext, rel: string): boolean {
  const gi = ctx.getText(".gitignore");
  if (!gi) return false;
  let ignored = false;
  for (let raw of gi.split("\n")) {
    raw = raw.trim();
    if (!raw || raw.startsWith("#")) continue;
    const neg = raw.startsWith("!");
    let pat = neg ? raw.slice(1) : raw;
    pat = pat.replace(/\/$/, "");
    const anchored = pat.startsWith("/") || pat.includes("/");
    pat = pat.replace(/^\//, "");
    const g = new Bun.Glob(anchored ? pat : `**/${pat}`);
    const hit = g.match(rel) || (!anchored && new Bun.Glob(pat).match(rel)) || rel.startsWith(`${pat}/`);
    if (hit) ignored = !neg;
  }
  return ignored;
}

/** Brace/quote-aware scan of JSX/HTML opening tags: returns tag name, attribute text, start offset. */
export function openingTags(text: string, names: RegExp): Array<{ tag: string; attrs: string; start: number }> {
  const out: Array<{ tag: string; attrs: string; start: number }> = [];
  const re = /<([A-Za-z][\w.-]*)(?=[\s/>])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!names.test(m[1])) continue;
    let i = m.index + m[0].length;
    let depth = 0;
    let q: string | null = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === q && text[i - 1] !== "\\") q = null;
      } else if (c === '"' || c === "'" || c === "`") q = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
    }
    out.push({ tag: m[1], attrs: text.slice(m.index + m[0].length, i), start: m.index });
    re.lastIndex = i;
  }
  return out;
}

export const hasAttr = (attrs: string, name: RegExp) => new RegExp(`(^|\\s)(?:${name.source})(?=[\\s=/>]|$)`).test(attrs);
