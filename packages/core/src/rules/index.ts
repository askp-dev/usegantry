import type { RuleDefinition } from "../context/types";
// Agent / MCP config (2)
import { mcp01HardcodedCreds } from "./agent/mcp-01-hardcoded-creds";
import { mcp02UnpinnedServers } from "./agent/mcp-02-unpinned-servers";
// BaaS & edge databases (5)
import { baas01ConvexAuth } from "./baas/baas-01-convex-auth";
import { baas02FirestoreRules } from "./baas/baas-02-firestore-rules";
import { baas03NosqlInjection } from "./baas/baas-03-nosql-injection";
// Vector & cache data layer (5)
import { cache01GlobalKeys } from "./data/cache-01-global-keys";
import { cache02NoTtl } from "./data/cache-02-no-ttl";
import { vec01TenantFilter } from "./data/vec-01-tenant-filter";
import { vec02UnauthClient } from "./data/vec-02-unauth-client";
import { vec03MetadataPii } from "./data/vec-03-metadata-pii";
import { edge01UnencryptedReplica } from "./edge/edge-01-unencrypted-replica";
import { edge02D1TenantPredicate } from "./edge/edge-02-d1-tenant-predicate";
import { a11y01InteractiveDom } from "./finops-ops/a11y-01-interactive-dom";
// Pillar 4: FinOps, Payments, Ops & Accessibility (12)
import { fin01InfiniteLoop } from "./finops-ops/fin-01-infinite-loop";
import { fin02AgentLoopCap } from "./finops-ops/fin-02-agent-loop-cap";
import { fin03UnboundedQuery } from "./finops-ops/fin-03-unbounded-query";
import { ops01HealthEndpoint } from "./finops-ops/ops-01-health-endpoint";
import { ops02DbPooler } from "./finops-ops/ops-02-db-pooler";
import { ops03SwallowedErrors } from "./finops-ops/ops-03-swallowed-errors";
import { ops04EnvValidator } from "./finops-ops/ops-04-env-validator";
import { pay01WebhookIdempotency } from "./finops-ops/pay-01-webhook-idempotency";
import { pay02CreditRace } from "./finops-ops/pay-02-credit-race";
import { pay03ChurnLifecycle } from "./finops-ops/pay-03-churn-lifecycle";
import { seo01LaunchMeta } from "./finops-ops/seo-01-launch-meta";
// Pillar 3: EULA, Licensing & Legal Scaffolding (6)
import { leg01Slopsquatting } from "./legal/leg-01-slopsquatting";
import { leg02CopyleftEula } from "./legal/leg-02-copyleft-eula";
import { leg03ClickwrapSchema } from "./legal/leg-03-clickwrap-schema";
import { leg04SubprocessorDrift } from "./legal/leg-04-subprocessor-drift";
import { leg05LegalRoutes } from "./legal/leg-05-legal-routes";
import { leg06AiDisclaimer } from "./legal/leg-06-ai-disclaimer";
// Pillar 2: Data Protection & Privacy Engineering (7)
import { priv01PiiLogs } from "./privacy/priv-01-pii-logs";
import { priv02DeletionCascade } from "./privacy/priv-02-deletion-cascade";
import { priv03TokenEncryption } from "./privacy/priv-03-token-encryption";
import { priv04ConsentGate } from "./privacy/priv-04-consent-gate";
import { priv05LlmPii } from "./privacy/priv-05-llm-pii";
import { priv06DataExport } from "./privacy/priv-06-data-export";
import { priv07SecurityHeaders } from "./privacy/priv-07-security-headers";
// Pillar 1: Security & Tenant Isolation (12)
import { sec01Rls } from "./security/sec-01-rls";
import { sec02ViewsRpc } from "./security/sec-02-views-rpc";
import { sec03OrmIdor } from "./security/sec-03-orm-idor";
import { sec04StorageBuckets } from "./security/sec-04-storage-buckets";
import { sec05PublicEnv } from "./security/sec-05-public-env";
import { sec06GitSecrets } from "./security/sec-06-git-secrets";
import { sec07UnauthActions } from "./security/sec-07-unauth-actions";
import { sec08Webhooks } from "./security/sec-08-webhooks";
import { sec09WalletDrain } from "./security/sec-09-wallet-drain";
import { sec10MassAssignment } from "./security/sec-10-mass-assignment";
import { sec11SsrfRedirect } from "./security/sec-11-ssrf-redirect";
import { sec12SqlXss } from "./security/sec-12-sql-xss";

export const ALL_STATIC_RULES: readonly RuleDefinition[] = [
  // Security (12)
  sec01Rls,
  sec02ViewsRpc,
  sec03OrmIdor,
  sec04StorageBuckets,
  sec05PublicEnv,
  sec06GitSecrets,
  sec07UnauthActions,
  sec08Webhooks,
  sec09WalletDrain,
  sec10MassAssignment,
  sec11SsrfRedirect,
  sec12SqlXss,
  // Agent / MCP config (2)
  mcp01HardcodedCreds,
  mcp02UnpinnedServers,
  // Vector & cache data layer (5)
  vec01TenantFilter,
  vec02UnauthClient,
  vec03MetadataPii,
  cache01GlobalKeys,
  cache02NoTtl,
  // BaaS & edge databases (5)
  baas01ConvexAuth,
  baas02FirestoreRules,
  baas03NosqlInjection,
  edge01UnencryptedReplica,
  edge02D1TenantPredicate,
  // Privacy (7)
  priv01PiiLogs,
  priv02DeletionCascade,
  priv03TokenEncryption,
  priv04ConsentGate,
  priv05LlmPii,
  priv06DataExport,
  priv07SecurityHeaders,
  // Legal & EULA (6)
  leg01Slopsquatting,
  leg02CopyleftEula,
  leg03ClickwrapSchema,
  leg04SubprocessorDrift,
  leg05LegalRoutes,
  leg06AiDisclaimer,
  // FinOps, Payments, Ops & A11y (12)
  fin01InfiniteLoop,
  fin02AgentLoopCap,
  fin03UnboundedQuery,
  pay01WebhookIdempotency,
  pay02CreditRace,
  pay03ChurnLifecycle,
  ops01HealthEndpoint,
  ops02DbPooler,
  ops03SwallowedErrors,
  ops04EnvValidator,
  a11y01InteractiveDom,
  seo01LaunchMeta,
] as const;
