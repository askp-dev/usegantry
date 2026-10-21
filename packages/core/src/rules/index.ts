import type { RuleDefinition } from "../context/types";
// Agent / MCP config (2)
import { mcp01HardcodedCreds } from "./agent/mcp-01-hardcoded-creds";
import { mcp02UnpinnedServers } from "./agent/mcp-02-unpinned-servers";
// BaaS & edge databases (5)
import { baas01ConvexAuth } from "./baas/baas-01-convex-auth";
import { baas02FirestoreRules } from "./baas/baas-02-firestore-rules";
import { baas03NosqlInjection } from "./baas/baas-03-nosql-injection";
// Client apps (2)
import { client01TauriScopes } from "./client/client-01-tauri-scopes";
import { client02AsyncstorageTokens } from "./client/client-02-asyncstorage-tokens";
import { aia01AiInventory } from "./compliance/aia-01-ai-inventory"; // profiles: ["eu-ai-act"]
import { hipaa01NonBaaVendor } from "./compliance/hipaa-01-non-baa-vendor"; // profiles: ["hipaa"]
import { hipaa02PhiAuditLog } from "./compliance/hipaa-02-phi-audit-log"; // profiles: ["hipaa"]
import { hipaa03SessionIdle } from "./compliance/hipaa-03-session-idle"; // profiles: ["hipaa"]
import { lgl01MatterNamespace } from "./compliance/lgl-01-matter-namespace"; // profiles: ["legal-privilege"]
import { lgl02LegalHoldCascade } from "./compliance/lgl-02-legal-hold-cascade"; // profiles: ["legal-privilege"]
import { lgl03AiRetention } from "./compliance/lgl-03-ai-retention"; // profiles: ["legal-privilege"]
import { pci01FloatMoney } from "./compliance/pci-01-float-money"; // profiles: ["fintech-pci"]
import { pci02LedgerMutation } from "./compliance/pci-02-ledger-mutation"; // profiles: ["fintech-pci"]
import { pci03MutationIdempotency } from "./compliance/pci-03-mutation-idempotency"; // profiles: ["fintech-pci"]
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
// Infra (3)
import { iac01PublicDataPorts } from "./infra/iac-01-public-data-ports";
import { iac02RootContainer } from "./infra/iac-02-root-container";
import { sov01TelemetryBeacons } from "./infra/sov-01-telemetry-beacons";
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
import { py01UnsafeDeserialization } from "./python/py-01-unsafe-deserialization";
import { py02SyncInAsync } from "./python/py-02-sync-in-async";
import { py03AgentExecSinks } from "./python/py-03-agent-exec-sinks";
import { py04SharedState } from "./python/py-04-shared-state";
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
  // Infra & client apps (5); SOV-01 is profile-only (`--profile airgap`)
  iac01PublicDataPorts,
  iac02RootContainer,
  client01TauriScopes,
  client02AsyncstorageTokens,
  sov01TelemetryBeacons,
  // Python backends (4)
  py01UnsafeDeserialization,
  py02SyncInAsync,
  py03AgentExecSinks,
  py04SharedState,
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
  // Compliance profiles (10, profile-only)
  hipaa01NonBaaVendor,
  hipaa02PhiAuditLog,
  hipaa03SessionIdle,
  pci01FloatMoney,
  pci02LedgerMutation,
  pci03MutationIdempotency,
  lgl01MatterNamespace,
  lgl02LegalHoldCascade,
  lgl03AiRetention,
  aia01AiInventory,
] as const;
