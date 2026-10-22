/**
 * Go/Rust route facts for the body-level route rules (SEC-07/08/09, PAY-01, PCI-03). They answer the
 * questions the TS path answers with CodeIndex regexes, but per call node on the ast-grep tree, so one
 * finding class keeps one rule id whatever the language.
 */
import { type SysLang, sysLangOf, sysLangUnavailable } from "../../context/systems-lang";
import { STRING_KINDS, unquote } from "../../context/systems-routes";
import type { RepoContext, RouteNode, SgNode } from "../../context/types";
import { RuleSkipped, WEBHOOK_URL_RE } from "../helpers";
import { handlerNode } from "./sys-helpers";

export interface Site {
  at: number;
  line: number;
  /** The source line, trimmed. */
  evidence: string;
}

export interface SysRouteFacts {
  route: RouteNode;
  firstMutation?: Site;
  paidCall?: Site;
  /** First in-body auth assertion or auth extractor param; `enforced` = it rejects (exit / `?` / extractor) before going on. */
  auth?: Site & { enforced: boolean };
  webhook: boolean;
  webhookVerified: boolean;
  rateLimited: boolean;
  inputCapped: boolean;
  /** Reads an idempotency key or inserts with ON CONFLICT DO NOTHING. */
  idempotencyKey: boolean;
  /** Webhook events de-duplicated: event id stored / checked, processed-events table, upsert. */
  eventDeduped: boolean;
}

interface Call {
  node: SgNode;
  at: number;
  name: string;
  callee: string;
  operand: string;
  args: string;
  lit: string;
}

const CALL_KINDS: Record<SysLang, string[]> = { go: ["call_expression"], rust: ["call_expression", "macro_invocation"] };
const COMMENT_KINDS: Record<SysLang, string[]> = { go: ["comment"], rust: ["line_comment", "block_comment"] };
const BLOCK = /^(?:block|statement_list|declaration_list)$/;
const CHECK_KINDS: Record<SysLang, string[]> = { go: ["if_statement"], rust: ["if_expression", "let_declaration", "match_expression"] };

// ── mutation ────────────────────────────────────────────────────────────────
const MUT_SQL =
  /^\s*(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+[\w."`]+\s+SET|DELETE\s+FROM|UPSERT|MERGE\s+INTO|REPLACE\s+INTO)\b|^\s*WITH\b[\s\S]*\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+[\w."`]+\s+SET)\b/i;
const GO_EXEC = /^(?:Exec|ExecContext|MustExec|MustExecContext|NamedExec|NamedExecContext)$/;
const GO_ORM = /^(?:Create|CreateInBatches|Save|Updates|Update|UpdateColumn|UpdateColumns|Delete|FirstOrCreate)$/;
const GO_ORM_RECV =
  /(?:^|\.)(?:db|DB|Db|tx|Tx|gorm|orm|repo|Repo|store|Store|dao|client)\b|\.(?:Model|Table|Where|WithContext|Clauses|Omit|Create|Update|Delete)\(/;
const DOC_MUT =
  /^(?:InsertOne|InsertMany|UpdateOne|UpdateMany|UpdateByID|DeleteOne|DeleteMany|ReplaceOne|FindOneAndUpdate|FindOneAndReplace|FindOneAndDelete|BulkWrite|insert_one|insert_many|update_one|update_many|delete_one|delete_many|replace_one|find_one_and_update|find_one_and_replace|find_one_and_delete)$/;
const RS_ORM = /^(?:insert|insert_many|update|update_many|delete|delete_many|delete_by_id|save|exec|exec_with_returning)$/;
const RS_DB_ARG = /\b(?:db|conn|pool|txn|tx)\b/;

function isMutation(lang: SysLang, c: Call): boolean {
  if (MUT_SQL.test(c.lit)) return true;
  if (DOC_MUT.test(c.name)) return true;
  if (lang === "go") {
    if (GO_EXEC.test(c.name)) return !/^\s*SELECT\b/i.test(c.lit);
    if (c.name === "Commit") return /tx/i.test(c.operand);
    return GO_ORM.test(c.name) && GO_ORM_RECV.test(c.operand);
  }
  if (c.name === "execute") return !/"\s*SELECT\b/i.test(c.callee);
  if (c.name === "commit") return /\btx|txn\b/.test(c.operand);
  if (/^(?:insert_into|replace_into)$/.test(c.name)) return true;
  if (/^(?:update|delete)$/.test(c.name) && (c.operand === "diesel" || /::table\b|\bdsl::/.test(c.args))) return true;
  return RS_ORM.test(c.name) && RS_DB_ARG.test(c.args) && (!c.name.startsWith("exec") || /\b(?:insert|update|delete)\w*\(/.test(c.callee));
}

// ── paid SDK calls ──────────────────────────────────────────────────────────
const GO_PAID =
  /(?:^|\.)(?:Create(?:Chat)?Completion(?:Stream)?|CreateImage|CreateEmbeddings|CreateSpeech|CreateTranscription|GenerateContent(?:Stream)?)$|\.(?:Completions|Messages|Responses|Embeddings|Images)\.New(?:Streaming)?$|\.Api\.CreateMessage$|^(?:charge|paymentintent|session|transfer|payout|refund|subscription|invoice)\.New$/;
const GO_SEND_RECV = /sendgrid|mailer|mail|email|Emails/i;
const RS_PAID =
  /\b(?:chat|completions|images|embeddings|messages|responses|audio)\(\)\s*\.\s*(?:create\w*|generate)$|\b(?:PaymentIntent|Charge|CheckoutSession|Transfer|Payout|Refund|Subscription)::create$/;
const isPaid = (lang: SysLang, c: Call) =>
  lang === "go" ? GO_PAID.test(c.callee) || (c.name === "Send" && GO_SEND_RECV.test(c.operand)) : RS_PAID.test(c.callee);

// ── auth ────────────────────────────────────────────────────────────────────
const AUTH_KEY =
  /\b(?:user|userID|userId|user_id|uid|claims|session|principal|identity|currentUser|account|auth)\b|(?:user|claims|session|auth)(?:Key|Ctx|ContextKey)\b/i;
const GO_AUTH =
  /^(?:ParseWithClaims|VerifyIDToken|VerifyIdToken|VerifySessionCookie|Authenticate\w*|CurrentUser|GetUser|GetSession|RequireUser|RequireAuth|MustAuth\w*|Authorize\w*|IsAuthenticated|IsLoggedIn|IsAdmin|HasRole|HasPermission|CheckAuth)$|(?:User|Claims|Session|Principal)From\w+$|^(?:Verify|Validate)\w*(?:Token|JWT|Jwt|Session)\w*$/;
const RS_AUTH =
  /^(?:verify_token|validate_token|verify_jwt|validate_jwt|authenticate|current_user|get_user|get_session|require_user|require_auth|authorize|identity|get_identity|is_authenticated)$|^(?:user|claims|session)_from\w*$/;
/** Axum / Actix extractors that reject the request themselves when there's no valid user. */
const RS_AUTH_EXTRACTOR = /^(?:[\w:]+::)?(?:Auth\w*|\w*User|\w*Claims|Identity|BearerAuth|Jwt\w*|Authenticated\w*)(?:<.*>)?$/s;
const RS_OPTIONAL_AUTH = /^Option<\s*(?:[\w:]+::)?(?:Auth\w*|\w*User|\w*Claims|Identity|Jwt\w*|Authenticated\w*)/;

function authCall(lang: SysLang, c: Call): "assert" | "enforce" | null {
  if (lang === "go") {
    if (c.name === "MustGet") return AUTH_KEY.test(c.args) ? "enforce" : null; // panics when unset
    // Request-context lookups count; header / query reads (`X-User-Id`) are client-controlled, not auth.
    if (/^(?:Get|GetString|Value|Locals)$/.test(c.name)) return AUTH_KEY.test(c.args) && !/Header|Query|Param|Form/i.test(c.operand) ? "assert" : null;
    if (c.name === "Parse" && /jwt/i.test(c.operand)) return "assert";
    return GO_AUTH.test(c.name) ? "assert" : null;
  }
  if (c.name === "decode" && (/jsonwebtoken/.test(c.operand) || /decode::</.test(c.callee))) return "assert";
  if (
    c.name === "get" &&
    (/extensions\(\)\s*\.\s*get::<\s*[\w:]*(?:User|Claims|Identity|Session)/.test(c.callee) || (/session/i.test(c.operand) && AUTH_KEY.test(c.args)))
  )
    return "assert";
  return RS_AUTH.test(c.name) ? "assert" : null;
}

// ── route-level signals (handler or file text, comments stripped) ─────────────
const WEBHOOK_HDR = /stripe-signature|svix-|webhook-signature|x-signature|paddle-signature|x-hub-signature/i;
const VERIFY =
  /(?:^|[.:])(?:ConstructEvent\w*|ValidatePayload|construct_event|verify_slice|verify_truncated_left|constant_time_eq|ct_eq)$|(?:^|\.)(?:hmac\.Equal|subtle\.ConstantTimeCompare)$|(?:wh|webhook|svix|Webhook)\w*\s*(?:\.|::)\s*(?:Verify|verify)$|(?:^|[.:])(?:[Vv]erify|[Vv]alidate)_?\w*(?:Signature|Webhook|signature|webhook)\w*$/;
const RATE =
  /golang\.org\/x\/time\/rate|didip\/tollbooth|ulule\/limiter|go-chi\/httprate|middleware\/limiter|\brate\.NewLimiter\b|\blimiter\.(?:Allow|Wait|Take|Get)\b|tower_governor|actix_governor|\bgovernor::|GovernorLayer|RateLimitLayer|Governor::new|RateLimiter/;
const CAP =
  /MaxBytesReader|DefaultBodyLimit|RequestBodyLimitLayer|JsonConfig|PayloadConfig|BodyLimit|\bMaxTokens\b|\bmax_tokens\b|MaxCompletionTokens|max_completion_tokens|MaxOutputTokens|max_output_tokens|\blen\([^)]*\)\s*>=?\s*(?:\d{3,}|\w*[Mm]ax\w*|[A-Z_]{3,})|\.len\(\)\s*>=?\s*(?:\d{3,}|\w*max\w*|[A-Z_]{3,})|RuneCountInString|\.chars\(\)\s*\.\s*count\(\)/;
const IDEM_KEY = /idempoten|on\s+conflict\s*(?:\([^)]*\)\s*)?do\s+nothing|DoNothing:\s*true|do_nothing\(\)/i;
const EVENT_DEDUP =
  /\b(?:event|evt|ev)\.(?:ID|id)\b|\bevent_?id\b|\bEventID\b|processed_?(?:webhook_?)?events?|webhook_?events|svix-id|webhook-id|on\s+conflict|OnConflict|on_conflict|upsert/i;
const PAY_VENDORS = new Set(["stripe", "paddle", "lemonsqueezy"]);

const exitIn = (lang: SysLang, n: SgNode) =>
  (lang === "go" ? ["return_statement"] : ["return_expression", "try_expression"]).some((kind) => n.find({ rule: { kind } })) ||
  /\b(?:Abort\w*|panic!?|Fatal\w*|bail!)\s*\(/.test(n.text());

function stripComments(lang: SysLang, n: SgNode): string {
  const base = n.range().start.index;
  let text = n.text();
  const cuts = COMMENT_KINDS[lang].flatMap((kind) => n.findAll({ rule: { kind } })).map((c) => [c.range().start.index - base, c.range().end.index - base]);
  for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + " ".repeat(b - a) + text.slice(b);
  return text;
}

function callsOf(lang: SysLang, fn: SgNode): Call[] {
  const out: Call[] = [];
  for (const node of CALL_KINDS[lang].flatMap((kind) => fn.findAll({ rule: { kind } }))) {
    let f = node.kind() === "macro_invocation" ? node.field("macro") : node.field("function");
    if (!f) continue;
    const callee = f.text();
    if (f.kind() === "generic_function") f = f.field("function") ?? f;
    const head =
      f.kind() === "selector_expression" || f.kind() === "field_expression"
        ? { name: f.field("field"), operand: f.field("operand") ?? f.field("value") }
        : f.kind() === "scoped_identifier"
          ? { name: f.field("name"), operand: f.field("path") }
          : { name: f, operand: undefined };
    const argNode = node.kind() === "macro_invocation" ? node.children().find((c) => c.kind() === "token_tree") : node.field("arguments");
    const lit =
      argNode && STRING_KINDS[lang].flatMap((kind) => argNode.findAll({ rule: { kind } })).sort((a, b) => a.range().start.index - b.range().start.index)[0];
    out.push({
      node,
      at: (head.name ?? f).range().start.index,
      name: head.name?.text() ?? "",
      callee,
      operand: head.operand?.text() ?? "",
      args: argNode?.text() ?? "",
      lit: lit ? unquote(lit.text()) : "",
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The statement directly inside a block that contains `n`. */
function statementOf(n: SgNode, fn: SgNode): SgNode {
  let s = n;
  for (let p = n.parent(); p && p.range().start.index >= fn.range().start.index && !BLOCK.test(p.kind()); p = p.parent()) s = p;
  return s;
}

/** Identifiers a statement / param binds (`u, ok :=`, `let Some(u) =`, `user: Option<AuthUser>`). */
function boundNames(s: SgNode): string[] {
  const lhs = s.field("left") ?? s.field("pattern") ?? (s.kind() === "var_declaration" ? s.find({ rule: { kind: "var_spec" } })?.field("name") : null);
  return (lhs?.text().match(/[A-Za-z_]\w*/g) ?? []).filter((w) => !/^(?:_|mut|ref|Some|Ok|Err|None)$/.test(w));
}

function factsOf(ctx: RepoContext, route: RouteNode, lang: SysLang, fn: SgNode): SysRouteFacts {
  const lines = ctx.getText(route.file).split("\n");
  const site = (n: SgNode, at = n.range().start.index): Site => {
    const line = n.range().start.line + 1;
    return { at, line, evidence: (lines[line - 1] ?? "").trim().slice(0, 200) };
  };
  const calls = callsOf(lang, fn);
  const mut = calls.find((c) => isMutation(lang, c));
  const paid = calls.find((c) => isPaid(lang, c));
  const firstMut = Math.min(mut?.at ?? Number.POSITIVE_INFINITY, paid?.at ?? Number.POSITIVE_INFINITY);

  // Auth: an extractor param, else the first in-body assertion; enforced by itself, by its own statement, or by a later check on what it bound.
  let auth: SysRouteFacts["auth"];
  let bound: string[] = [];
  let from = 0;
  for (const p of lang === "rust"
    ? (fn
        .field("parameters")
        ?.children()
        .filter((c) => c.kind() === "parameter") ?? [])
    : []) {
    const type = p.field("type")?.text() ?? "";
    if (/^Option</.test(type) ? RS_OPTIONAL_AUTH.test(type) : RS_AUTH_EXTRACTOR.test(type)) {
      auth = { ...site(p), enforced: !/^Option</.test(type) };
      bound = boundNames(p);
      from = p.range().start.index;
      break;
    }
  }
  if (!auth)
    for (const c of calls) {
      const kind = authCall(lang, c);
      if (!kind) continue;
      const stmt = statementOf(c.node, fn);
      auth = { ...site(c.node, c.at), enforced: kind === "enforce" || exitIn(lang, stmt) };
      bound = boundNames(stmt);
      from = stmt.range().start.index;
      break;
    }
  if (auth && !auth.enforced && bound.length) {
    const ref = new RegExp(`\\b(?:${bound.join("|")})\\b`);
    auth.enforced = CHECK_KINDS[lang]
      .flatMap((kind) => fn.findAll({ rule: { kind } }))
      .some((n) => {
        const start = n.range().start.index;
        if (start < from || start >= firstMut) return false;
        const cond = n.field("condition") ?? n.field("value");
        return !!cond && ref.test(cond.text()) && exitIn(lang, n);
      });
  }

  const body = stripComments(lang, fn);
  const fileText = stripComments(lang, ctx.getAst(route.file).root());
  const vendors = route.externalSdksCalled;
  return {
    route,
    ...(mut ? { firstMutation: site(mut.node, mut.at) } : {}),
    ...(paid ? { paidCall: site(paid.node, paid.at) } : {}),
    ...(auth ? { auth } : {}),
    webhook:
      route.method === "POST" &&
      (WEBHOOK_URL_RE.test(route.urlPath) ||
        WEBHOOK_HDR.test(body) ||
        (/\b(?:event|evt)\.(?:Type|type_)\b/.test(body) && vendors.some((v) => PAY_VENDORS.has(v)))),
    webhookVerified: calls.some((c) => VERIFY.test(c.callee)),
    rateLimited: route.hasRateLimit || RATE.test(fileText),
    inputCapped: CAP.test(fileText),
    idempotencyKey: IDEM_KEY.test(body),
    eventDeduped: IDEM_KEY.test(body) || EVENT_DEDUP.test(body),
  };
}

const cache = new WeakMap<RepoContext, { facts: SysRouteFacts[]; skipped?: string }>();

/** Facts for every Go/Rust route, plus why a language present in the repo couldn't be analysed. */
export function sysRouteFacts(ctx: RepoContext): { facts: SysRouteFacts[]; skipped?: string } {
  let hit = cache.get(ctx);
  if (hit) return hit;
  hit = { facts: [] };
  for (const lang of ["go", "rust"] as SysLang[]) {
    if (!ctx.files.all.some((f) => sysLangOf(f) === lang)) continue;
    const why = sysLangUnavailable(lang);
    if (why) {
      hit.skipped ??= why;
      continue;
    }
    for (const r of ctx.routes) {
      const fn = r.language === lang ? handlerNode(ctx, r, lang) : undefined;
      if (fn) hit.facts.push(factsOf(ctx, r, lang, fn));
    }
  }
  cache.set(ctx, hit);
  return hit;
}

/**
 * Route rules branch once here: `ts` runs on TS/Python routes (CodeIndex path), `sys` on Go/Rust route
 * facts. When Go/Rust sources can't be analysed, it throws `RuleSkipped` after the rest has run, so
 * the rule keeps its findings but isn't certified as passed.
 */
export function eachRoute(ctx: RepoContext, ts: (r: RouteNode) => void, sys: (f: SysRouteFacts) => void): void {
  for (const r of ctx.routes) if (r.language !== "go" && r.language !== "rust") ts(r);
  const { facts, skipped } = sysRouteFacts(ctx);
  for (const f of facts) sys(f);
  if (skipped) throw new RuleSkipped(skipped);
}
