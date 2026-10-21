/** Shared detection vocabularies used by the context builder and the rules. */

/** Known auth assertions (SPEC §4.C + common SDKs). Applied to masked code. */
export const AUTH_ASSERTION_RE =
  /\b(?:getUser|getSession|getServerSession|getServerAuthSession|auth\s*\(\s*\)|auth\.protect|currentUser\s*\(|requireAuth|requireUser|requireSession|requireAdmin|verifyToken|verifyIdToken|verifySession|validateRequest|validateSession|getAuth\s*\(|withAuth|withApiAuthRequired|isAuthenticated|ensureAuthenticated|ensureAuth|locals\.user|locals\.session|locals\.auth|locals\.getSession|locals\.safeGetSession|safeGetSession|get_current_user|get_current_active_user|login_required|jwt_required|current_user|getKindeServerSession|clerkClient\.authenticateRequest|authenticateRequest|protectedProcedure|authedProcedure|privateProcedure|adminProcedure|verifyJwt|jwtVerify|jwt\.verify|passport\.authenticate|req\.user|req\.auth|request\.user|request\.auth|ctx\.session|ctx\.user|session\?\.user|session\.user|getCurrentUser|assertAuth|assertUser|checkAuth|authorize\s*\(|getToken\s*\(|getUserOrThrow|requireUserId|getUserId\s*\()/;

/** Database mutation call sites (SPEC §4.C step 3). */
export const DB_MUTATION_RE =
  /\b(?:prisma|db|tx|ctx\.db|ctx\.prisma)\.\$?\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe)\s*\(|\b(?:db|tx|ctx\.db)\.(?:insert|update|delete)\s*\(|\bsupabase\w*\s*\.\s*from\s*\([^)]*\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(|\.rpc\s*\(|\b(?:prisma|db)\.\$executeRaw|\b\w+\.(?:insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findByIdAndDelete)\s*\(|\bsession\.(?:add|delete|commit|merge)\s*\(|\bdb\.(?:add|delete|commit|session\.add)\s*\(|\bsql\s*`\s*(?:insert|update|delete)|\.(?:collection|doc)\([^)]*\)\.(?:set|update|add|delete)\s*\(/i;

/** Paid / external API SDK call sites (wallet-drain vectors). */
export const PAID_SDK_CALL_RE =
  /\b(?:openai|anthropic|client|ai|llm|model|groq|mistral|cohere|replicate|elevenlabs|resend|stripe|twilio|sendgrid)\w*\s*\.\s*(?:chat\.completions\.create|completions\.create|responses\.create|messages\.create|messages\.stream|embeddings\.create|images\.generate|audio\.\w+\.create|run|predictions\.create|textToSpeech\.\w+|emails\.send|send|charges\.create|paymentIntents\.create|checkout\.sessions\.create|messages\.create)\s*\(|\b(?:generateText|streamText|generateObject|streamObject|embed|embedMany|generateImage|experimental_generateImage)\s*\(/;

export const GENAI_PACKAGES = /^(openai|@anthropic-ai\/sdk|ai|@ai-sdk\/[\w-]+|replicate|elevenlabs|@elevenlabs\/elevenlabs-js|@google\/generative-ai|@google\/genai|@mistralai\/mistralai|cohere-ai|groq-sdk|langchain|@langchain\/[\w-]+|llamaindex|together-ai|@fal-ai\/client|@huggingface\/inference|anthropic|google-generativeai|google-genai|mistralai|cohere|groq|together)$/;

export const LLM_CALL_RE =
  /\b(?:chat\.completions\.create|completions\.create|responses\.create|messages\.create|messages\.stream|generateText|streamText|generateObject|streamObject|invoke|\.call|predictions\.create|textToSpeech\.convert|replicate\.run)\s*\(/;

export const RATE_LIMIT_RE =
  /\b(?:ratelimit|rateLimit|rateLimiter|RateLimiter|Ratelimit|limiter\.(?:limit|consume|check)|slowapi|Limiter|throttle|throttler|tokenBucket|checkRateLimit|withRateLimit|aj\.protect|arcjet|express-rate-limit|rateLimitMiddleware|@limiter\.limit|limiter\.limit)\b/;

export const WEBHOOK_VERIFY_RE =
  /\b(?:webhooks\.constructEvent(?:Async)?|constructEvent(?:Async)?|webhooks\.unwrap|unwrapWebhook|verifyWebhook\w*|verifyWebhookSignature|verifySignature|validateWebhook\w*|validateEvent|verifyHeader|wh\.verify|webhook\.verify|Webhook\s*\([^)]*\)\s*\.verify|svix|timingSafeEqual|compare_digest|construct_event|verify_webhook|signature\.verify|isValidSignature|verifyPaddleWebhook|verifyRequestSignature)\b/;

export const SESSION_SCOPE_KEYS = /^(userId|user_id|ownerId|owner_id|orgId|org_id|organizationId|organization_id|tenantId|tenant_id|authorId|author_id|accountId|account_id|teamId|team_id|workspaceId|workspace_id|createdBy|created_by|memberId|profileId|profile_id|customerId|customer_id|user|owner|organization|tenant|author|team|workspace|members|AND|OR)$/;

export const SECRET_NAME_RE = /(SECRET|PRIVATE|SERVICE_ROLE|SERVICE_KEY|ADMIN|DATABASE_URL|DB_URL|POSTGRES_URL|DIRECT_URL|OPENAI|ANTHROPIC|STRIPE_SK|STRIPE_SECRET|RESEND|SENDGRID|TWILIO_AUTH|WEBHOOK_SECRET|SIGNING|PASSWORD|PASSWD|_PAT\b|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|API_SECRET|CLIENT_SECRET|MASTER_KEY|ENCRYPTION_KEY|JWT_SECRET)/i;

/** Env prefixes that inline values into the client bundle. */
export const PUBLIC_ENV_PREFIX_RE = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|GATSBY_|VUE_APP_)/;

/** Values that are unambiguously private keys. */
export const PRIVATE_VALUE_RE = /^(sk_live_|rk_live_|sk-proj-|sk-ant-|sb_secret_|sk-[A-Za-z0-9]{20,}|whsec_|xox[bap]-|ghp_|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN)/;

/** Vendor secret signatures (SEC-06; 35 patterns). */
export const SECRET_PATTERNS: Array<{ id: string; name: string; re: RegExp; severity?: "CRITICAL" | "HIGH" }> = [
  { id: "aws-access-key", name: "AWS Access Key ID", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "aws-secret", name: "AWS Secret Access Key", re: /aws_?secret_?access_?key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}\b/i },
  { id: "stripe-live-secret", name: "Stripe Live Secret Key", re: /\b(sk|rk)_live_[0-9a-zA-Z]{20,}\b/ },
  { id: "stripe-test-secret", name: "Stripe Test Secret Key", re: /\bsk_test_[0-9a-zA-Z]{20,}\b/, severity: "HIGH" },
  { id: "stripe-webhook", name: "Stripe Webhook Signing Secret", re: /\bwhsec_[0-9a-zA-Z]{24,}\b/ },
  { id: "openai-key", name: "OpenAI API Key", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/ },
  { id: "anthropic-key", name: "Anthropic API Key", re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/ },
  { id: "supabase-secret", name: "Supabase Secret Key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { id: "supabase-service-role", name: "Supabase service_role JWT", re: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{20,}/ },
  { id: "github-pat", name: "GitHub Personal Access Token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: "gitlab-pat", name: "GitLab Personal Access Token", re: /\bglpat-[A-Za-z0-9_-]{20}\b/ },
  { id: "slack-token", name: "Slack Token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "slack-webhook", name: "Slack Webhook URL", re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/ },
  { id: "discord-webhook", name: "Discord Webhook URL", re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{50,}/ },
  { id: "google-api-key", name: "Google API Key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "HIGH" },
  { id: "google-oauth-secret", name: "Google OAuth Client Secret", re: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/ },
  { id: "gcp-service-account", name: "GCP Service Account Key", re: /"type"\s*:\s*"service_account"[\s\S]{0,200}"private_key"/ },
  { id: "private-key-pem", name: "Private Key (PEM)", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: "twilio-key", name: "Twilio API Key", re: /\bSK[0-9a-fA-F]{32}\b/, severity: "HIGH" },
  { id: "sendgrid-key", name: "SendGrid API Key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: "resend-key", name: "Resend API Key", re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}\b/ },
  { id: "mailgun-key", name: "Mailgun API Key", re: /\bkey-[0-9a-f]{32}\b/ },
  { id: "postmark-token", name: "Postmark Server Token", re: /postmark[\w-]*\s*[:=]\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i },
  { id: "clerk-secret", name: "Clerk Secret Key", re: /\bsk_live_[A-Za-z0-9]{40,}\b/ },
  { id: "huggingface-token", name: "Hugging Face Token", re: /\bhf_[A-Za-z0-9]{34,}\b/ },
  { id: "replicate-token", name: "Replicate API Token", re: /\br8_[A-Za-z0-9]{37}\b/ },
  { id: "groq-key", name: "Groq API Key", re: /\bgsk_[A-Za-z0-9]{50,}\b/ },
  { id: "xai-key", name: "xAI API Key", re: /\bxai-[A-Za-z0-9]{70,}\b/ },
  { id: "npm-token", name: "npm Access Token", re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: "pypi-token", name: "PyPI Upload Token", re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/ },
  { id: "shopify-token", name: "Shopify Access Token", re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/ },
  { id: "square-token", name: "Square Access Token", re: /\bEAAA[A-Za-z0-9_-]{60}\b/ },
  { id: "db-url-password", name: "Database URL with Password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/[^:\s/'"@]+:[^@\s'"]{6,}@[^\s'"]+/ },
  { id: "jwt-generic", name: "Hardcoded JWT Secret", re: /\b(?:JWT_SECRET|jwtSecret|jwt_secret)\s*[:=]\s*['"][^'"\s]{12,}['"]/ },
  { id: "linear-key", name: "Linear API Key", re: /\blin_api_[A-Za-z0-9]{40}\b/ },
];

/** Values that are obviously not a real secret (SEC-06 / MCP-01 entropy checks). */
export const SECRET_PLACEHOLDER_RE = /your|xxx|example|changeme|placeholder|dummy|sample|test_?key|<|\.\.\./i;

/** Placeholders that should never ship in legal copy. */
export const PLACEHOLDER_RE = /\[(?:COMPANY(?: NAME)?|YOUR (?:COMPANY|NAME|EMAIL)|DATE|ADDRESS|EMAIL|JURISDICTION|PRODUCT(?: NAME)?)\]|\bTODO\b|\bTBD\b|lorem ipsum|\{\{\s*company\s*\}\}|\bACME (?:Inc|Corp)\b/i;
