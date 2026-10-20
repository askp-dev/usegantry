/**
 * Canonical data contracts (SPEC.md §3). Every module communicates through these.
 *
 * `SgRoot` is declared structurally so the core compiles and runs without the optional
 * native `@ast-grep/napi` addon installed. When the addon is present, `getAst()` returns a
 * real `SgRoot` from it; rules in this repo use `getCode()` (the zero-dependency structural
 * index in `code-index.ts`) so they always run.
 */
import type { CodeIndex } from "./code-index";

export interface SgNode {
  text(): string;
  kind(): string;
  range(): { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } };
  find(pattern: string | object): SgNode | null;
  findAll(pattern: string | object): SgNode[];
  getMatch(name: string): SgNode | null;
  getMultipleMatches(name: string): SgNode[];
}
export interface SgRoot {
  root(): SgNode;
  filename(): string;
}

export type Pillar = "SECURITY" | "PRIVACY" | "LEGAL" | "FINOPS_OPS";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface Finding {
  ruleId: string; // e.g., "SEC-01", "LEG-04", "PT-04", "FIN-01"
  pillar: Pillar;
  severity: Severity;
  blocking: boolean; // True for CRITICAL findings; blocks CI and Launch Certificate
  title: string;
  file: string; // Relative path from repo root
  line: number; // 1-indexed line number
  evidence: string; // Offending code snippet or HTTP response proof
  impact: string; // Plain-English explanation of breach/cost/legal risk
  agentRemediationPrompt: string; // Surgical prompt injected into Cursor / Claude Code
  autoFixPatch?: {
    startLine: number;
    endLine: number;
    replacementText: string;
  };
  /** Stable fingerprint (rule + file + normalized evidence) used for baselines & dedupe. */
  fingerprint?: string;
  /** Optional graph node this finding is attached to (route / table / vendor id). */
  nodeRef?: string;
}

export type PolicyCommand = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";

export interface TableSchema {
  name: string;
  file: string;
  line: number;
  rlsEnabled: boolean;
  policies: Array<{
    name: string;
    command: PolicyCommand;
    usingExpr: string;
    checkExpr: string;
  }>;
  columns: Array<{
    name: string;
    type: string;
    isPII: boolean;
    isEncrypted: boolean;
    foreignKeyTable?: string;
    onDeleteCascade: boolean;
    /** Raw ON DELETE action (CASCADE | SET NULL | RESTRICT | NO ACTION | ...). */
    onDelete?: string;
    line?: number;
  }>;
  /** Where the table definition came from. */
  source?: "sql" | "prisma" | "drizzle" | "sqlalchemy";
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "SERVER_ACTION";

export interface RouteNode {
  file: string;
  line: number;
  urlPath: string;
  method: HttpMethod;
  hasAuthGuard: boolean;
  hasRateLimit: boolean;
  hasWebhookVerification: boolean;
  dbTablesAccessed: string[];
  externalSdksCalled: string[];
  /** Name of the exported handler / action function. */
  handlerName?: string;
  /** Character offsets of the handler body inside `getText(file)` (internal). */
  bodyStart?: number;
  bodyEnd?: number;
  language?: "ts" | "py";
}

export interface SqlView {
  name: string;
  file: string;
  line: number;
  securityInvoker: boolean;
  statement: string;
}
export interface SqlFunction {
  name: string;
  file: string;
  line: number;
  securityDefiner: boolean;
  hasSearchPath: boolean;
  hasAuthCheck: boolean;
  returnsTrigger: boolean;
  /** EXECUTE revoked from public/anon/authenticated */
  executeRevoked: boolean;
  statement: string;
}
export interface StorageBucket {
  id: string;
  public: boolean;
  file: string;
  line: number;
  statement: string;
}
export interface StoragePolicy {
  name: string;
  command: PolicyCommand;
  usingExpr: string;
  checkExpr: string;
  roles: string;
  file: string;
  line: number;
}

export interface Dependency {
  name: string;
  version: string;
  isDirect: boolean;
  spdxLicense?: string;
  weeklyDownloads?: number;
  existsInRegistry: boolean;
  /** Extended fields */
  ecosystem?: "npm" | "pypi";
  isDev?: boolean;
  declaredIn?: string;
  declaredLine?: number;
  /** True when the version is a workspace:/file:/link:/git reference. */
  isLocal?: boolean;
}

export interface DetectedSubprocessor {
  id: string;
  pkg: string;
  entityName: string;
  category: string;
  dataProcessed: string[];
  jurisdiction: string;
  privacyPolicyUrl: string;
  dpaUrl: string;
  triggersClauses: string[];
  /** Extended: how we detected it (package name or env key) */
  detectedVia?: string;
}

export interface EnvEntry {
  key: string;
  value: string;
  file: string;
  line: number;
}

export interface PreflightConfig {
  /** commercial (default) | open-source — affects LEG-02 */
  mode: "commercial" | "open-source";
  companyName: string;
  productName: string;
  contactEmail: string;
  jurisdiction: "US-DE" | "EU" | "US-CA" | "UK";
  legalDir: string;
  strict: boolean;
  ignoreRules: string[];
  ignorePaths: string[];
  offline: boolean;
  deployTarget?: "vercel" | "cloudflare" | "aws-lambda" | "netlify" | "node" | "unknown";
  clauses: {
    aiOutputDisclaimer: boolean;
    noTrainingApi: boolean;
    pciBillingDelegation: boolean;
    gdprErasure: boolean;
  };
}

export interface RepoContext {
  rootDir: string;
  framework: "nextjs" | "sveltekit" | "fastapi" | "express" | "unknown";
  gitCommitSha: string;
  files: {
    all: string[];
    serverRoutesAndActions: string[];
    frontendComponents: string[];
    sqlMigrations: string[];
    envFiles: string[];
    legalDocs: string[];
  };
  getAst: (relPath: string) => SgRoot;
  getText: (relPath: string) => string;
  dbTables: Map<string, TableSchema>;
  routes: RouteNode[];
  dependencies: Map<string, Dependency>;
  detectedSubprocessors: DetectedSubprocessor[];

  // ── Extensions beyond the SPEC contract ────────────────────────────────────
  /** Zero-dependency structural index (masked text, functions, calls, braces). */
  getCode: (relPath: string) => CodeIndex;
  /** All files whose path matches a glob (Bun.Glob semantics). */
  glob: (pattern: string) => string[];
  hasFile: (relPath: string) => boolean;
  packageJson: Record<string, any> | null;
  env: EnvEntry[];
  sql: { views: SqlView[]; functions: SqlFunction[]; buckets: StorageBucket[]; storagePolicies: StoragePolicy[] };
  /** Detected platform stack flags */
  stack: {
    supabase: boolean;
    prisma: boolean;
    drizzle: boolean;
    sqlalchemy: boolean;
    stripe: boolean;
    genAi: boolean;
    deployTarget: PreflightConfig["deployTarget"];
    frameworkVersion?: string;
  };
  config: PreflightConfig;
  timings: Record<string, number>;
}

export interface RuleDefinition {
  id: string;
  pillar: Pillar;
  severity: Severity;
  title: string;
  /** Rules return findings; severity on a finding may be overridden per-finding. */
  run: (ctx: RepoContext) => Finding[] | Promise<Finding[]>;
}

export interface PillarScore {
  pillar: Pillar;
  score: number;
  critical: number;
  high: number;
  medium: number;
}

export interface AuditReport {
  tool: { name: "preflight"; version: string; rulesetVersion: string };
  repo: { name: string; rootDir: string; framework: RepoContext["framework"]; frameworkVersion?: string; gitCommitSha: string; stack: string[] };
  generatedAt: string;
  durationMs: number;
  timings: Record<string, number>;
  score: number;
  status: "LAUNCH_READY" | "LAUNCH_BLOCKED" | "NEEDS_REVIEW";
  blockers: number;
  pillars: PillarScore[];
  findings: Finding[];
  suppressed: number;
  graph: DataFlowGraph;
  stats: { files: number; routes: number; tables: number; dependencies: number; subprocessors: number };
  /** Rules that threw; isolated so one bad rule never sinks the scan. */
  errors?: Array<{ ruleId: string; message: string }>;
}

export interface DataFlowNode {
  id: string;
  column: "entrypoint" | "api" | "database" | "vendor";
  label: string;
  sublabel?: string;
  status: "ok" | "warn" | "block";
  badges: string[];
  ruleIds: string[];
}
export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: Array<{ from: string; to: string; status: "ok" | "warn" | "block"; dashed?: boolean }>;
}

export interface LegalClause {
  id: "AI_OUTPUT_DISCLAIMER" | "NO_TRAINING_API" | "PCI_BILLING_DELEGATION" | "GDPR_ERASURE";
  label: string;
  enabled: boolean;
  reason: string;
}

export interface LegalManifest {
  version: string;
  stackHash: string;
  generatedAt: string;
  jurisdiction: PreflightConfig["jurisdiction"];
  companyName: string;
  productName: string;
  contactEmail: string;
  subprocessors: DetectedSubprocessor[];
  piiCategories: Array<{ category: string; fields: string[]; tables: string[] }>;
  clauses: LegalClause[];
  documents: Record<string, string>; // relPath -> full compiled content
}

export type PentestEventType = "PROBE_START" | "HTTP_TRACE" | "PROBE_RESULT" | "PENTEST_COMPLETE" | "PENTEST_ERROR";

export interface HttpTrace {
  probeId: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: string };
  response?: { status: number; headers: Record<string, string>; bodySnippet: string };
  error?: string;
  latencyMs: number;
  curl: string;
}

export interface ProbeResult {
  probeId: string;
  name: string;
  severity: Severity;
  status: "EXPLOITED" | "BLOCKED" | "SKIPPED" | "ERROR";
  summary: string;
  latencyMs: number;
  traces: HttpTrace[];
  findings: Finding[];
}

export interface PentestEvent {
  type: PentestEventType;
  probeId?: string;
  name?: string;
  trace?: HttpTrace;
  result?: ProbeResult;
  results?: ProbeResult[];
  message?: string;
  at: number;
}
