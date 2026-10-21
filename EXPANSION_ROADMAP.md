# `EXPANSION_ROADMAP.md` — Scaling Preflight Across Languages, Databases & Industries

## 1. Expanding the Database & Vector Store Layer

*Currently, Stage 1 normalizes Postgres/Supabase DDL, Prisma, and Drizzle into `ctx.dbTables`. We can extend `schema-parser.ts` to cover BaaS platforms, NoSQL, and AI Vector Databases.*

| Database Category | Target Engines & Files | High-Signal "AI Footguns" to Detect & Auto-Remediate |
| --- | --- | --- |
| **Vector & RAG Databases** *(Critical for AI Apps)* | **Qdrant**, **Pinecone**, **Milvus**, **Weaviate**, **Chroma**, **pgvector** (`HNSW`/`IVFFlat` migrations & client SDK calls) | • **`VEC-01` Cross-Tenant RAG Leakage:** Querying embeddings (`client.search()`, `similaritySearch()`) without an explicit `filter: { must: [{ key: "tenant_id", match: { value: orgId } }] }`—allowing User A's RAG prompt to retrieve User B's private documents.<br>

<br>• **`VEC-02` Unauthenticated Vector Instance:** Instantiating Qdrant/Chroma/Milvus clients without `apiKey` or TLS enabled on public ports (`6333`, `8000`).<br>

<br>• **`VEC-03` Unredacted PII in Embedding Metadata:** Storing raw SSNs, emails, or unencrypted medical/legal text inside vector `payload`/`metadata` objects that bypass primary DB encryption. |
| **Realtime BaaS & Document Stores** | **Convex** (`convex/schema.ts`), **Firebase Firestore** (`firestore.rules`), **PocketBase**, **Appwrite**, **MongoDB / Mongoose** | • **`BAAS-01` Convex Public Mutation Trap:** Exporting `mutation()` or `query()` in `convex/*.ts` instead of `internalMutation()` for admin/webhook functions, or forgetting `await ctx.auth.getUserIdentity()`.<br>

<br>• **`BAAS-02` Firestore Wildcard Rule:** Detecting `match /{document=**} { allow read, write: if request.auth != null; }` (which lets *any* logged-in user read/delete *every* other user's documents).<br>

<br>• **`BAAS-03` NoSQL Operator Injection:** Passing raw JSON objects into `Model.find(req.body)` allowing `{"$gt": ""}` auth bypasses. |
| **Edge SQL & Embedded Databases** | **Cloudflare D1**, **Turso / libSQL**, **Neon Serverless**, **DuckDB**, **SQLite** | • **`EDGE-01` Unencrypted Local/Edge Replicas:** Using Turso embedded replicas or local SQLite files storing PII without `encryptionKey` cipher configuration.<br>

<br>• **`EDGE-02` Missing Multi-Tenant Row Filtering:** Since SQLite/D1 lacks native Postgres RLS, automatically verify that all Drizzle/Kysely queries against D1 wrap a tenant-scoped helper (`withTenant(db, orgId)`). |
| **Redis, Queues & Cache Layers** | **Upstash Redis**, **BullMQ**, **Inngest**, **Trigger.dev** | • **`CACHE-01` Tenant Cache Poisoning:** Caching API responses under global keys (`redis.set("dashboard_stats", data)`) instead of tenant-prefixed keys (`tenant:${orgId}:dashboard_stats`).<br>

<br>• **`CACHE-02` Unbounded TTL Memory Leak:** Calling `redis.set()` on session or LLM state without an `EX` / TTL expiration parameter. |

---

## 2. Multi-Language & Framework Expansion (`@ast-grep/napi`)

Because `@ast-grep/napi` natively compiles Tree-sitter grammars for **Python, Go, Rust, C#, C++, Java, Kotlin, Swift, and Ruby**, extending Preflight to new backend languages only requires mapping each language's AST node patterns into `ctx.routes` and `ctx.dependencies`.

### A. Python AI & Data Backends (FastAPI, Django, Flask, LangChain, LlamaIndex)

* **Lockfiles:** `uv.lock`, `poetry.lock`, `Pipfile.lock`, `requirements.txt`.
* **Python-Specific Rules (`PY-01` to `PY-05`):**
* **`PY-01` Unsafe Model/Cache Deserialization:** Flags `pickle.loads()`, `torch.load()` without `weights_only=True`, or `yaml.load()` without `SafeLoader`.
* **`PY-02` FastAPI Sync-in-Async Event Loop Block:** Detects synchronous blocking calls (`requests.get()`, `time.sleep()`, synchronous SQLAlchemy/psycopg2 queries) inside `async def` FastAPI routes that freeze the entire Uvicorn worker pool under load.
* **`PY-03` LangChain / LlamaIndex Code Execution Sinks:** Flags `PythonREPLTool`, `BashProcess`, or `create_pandas_dataframe_agent(..., allow_dangerous_code=True)` exposed to untrusted user prompts.
* **`PY-04` Mutable Default Arguments & Global State Leak:** Catches `def process(items=[]):` or module-level dictionaries storing per-request user chat histories across concurrent requests.



### B. Go & Rust High-Concurrency Services (Axum, Actix, Gin, Fiber, Echo)

* **Lockfiles:** `Cargo.lock`, `go.sum`.
* **Systems-Specific Rules (`SYS-01` to `SYS-04`):**
* **`SYS-01` Unbounded Goroutine / Tokio Task Spawn:** Flags `go func()` or `tokio::spawn()` triggered inside an HTTP handler loop without a `Semaphore`, worker pool, or `errgroup.SetLimit()`, allowing a single burst request to exhaust server memory.
* **`SYS-02` Rust Panic in Production HTTP Handler:** Flags `.unwrap()` and `.expect()` on user-controlled input, headers, or DB results inside Axum/Actix route handlers (crashing the worker thread on malformed input).
* **`SYS-03` Go Context Cancellation Drops:** Detects database or LLM HTTP requests using `context.Background()` instead of `r.Context()`, causing hung downstream tasks to keep burning resources after the client disconnects.



### C. Mobile, Desktop & Indie Game / XR Clients (Expo/React Native, Flutter, Tauri, Godot 4, Unity)

* **Why This Matters:** Developers increasingly use LLMs to write mobile apps, desktop wrappers, and multiplayer games that ship compiled binaries directly to end users.
* **Client/Engine Rules (`CLIENT-01` to `CLIENT-05`):**
* **`CLIENT-01` Tauri Shell / FS Allowlist Over-Permission (`tauri.conf.json`):** Flags `"shell": { "all": true }` or unrestricted `"fs": { "scope": ["**"] }` that turns any XSS in the webview into full Remote Code Execution (RCE) on the user's Mac/PC.
* **`CLIENT-02` Expo / React Native Plaintext `AsyncStorage` Auth:** Flags storing JWTs, refresh tokens, or API keys in unencrypted `AsyncStorage` instead of `expo-secure-store` / iOS Keychain / Android Keystore.
* **`CLIENT-03` Game Engine Authority & P2P Desync (`Godot 4` `.gd` / `Unity` `.cs`):** Scans multiplayer RPCs (`@rpc("any_peer")` in GDScript or `[ServerRpc(RequireOwnership = false)]` in Unity Netcode) that trust client-submitted position, inventory, health, or currency mutations without server-authoritative validation, or bundle third-party assets with restrictive Non-Commercial/CC-BY-NC licenses into a commercial Steam build.



---

## 3. Infrastructure, Docker & Local AI Appliance Guardrails (`IAC-*`)

*As teams deploy self-hosted apps via Docker Compose, Coolify, Caddy, Kubernetes, or on-premise AI hardware, LLMs frequently generate dangerously permissive infrastructure configs.*

* **`IAC-01` Docker Port Binding Bypass (`docker-compose.yml`):**
* **The Footgun:** Publishing `"5432:5432"` (Postgres), `"6379:6379"` (Redis), or `"6333:6333"` (Qdrant) in `docker-compose.yml`. Notice that Docker manipulates `iptables` directly—**bypassing `ufw` (Uncomplicated Firewall)** on Linux hosts and exposing the database to the public internet!
* **Auto-Fix:** Rewrite port bindings to loopback (`"127.0.0.1:5432:5432"`) or internal Docker bridge networks.


* **`IAC-02` Root Container & Mounted Docker Socket:**
* Flags `Dockerfile` definitions missing a non-root `USER` directive, or `docker-compose.yml` mounts exposing `/var/run/docker.sock` to web containers.


* **`IAC-03` Air-Gapped / Sovereign Telemetry Leak (`SOV-01`):**
* **High-Value Enterprise Niche:** For air-gapped or on-premise local RAG appliances, scans the entire dependency tree and container configs for "phone-home" telemetry beacons (Next.js telemetry, ChromaDB/LangChain/Unstructured anonymous PostHog pings, external Google Fonts links, or CDN script tags) that violate strict zero-egress/air-gap SLAs.



---

## 4. Vertical Compliance & Regulated Industry Packs (Monetization Add-Ons)

Instead of bloating the base CLI for indie hackers, offer **Switchable Compliance Profiles** (`npx preflight scan --profile hipaa` or `--profile legal-privilege`) for agencies and consultants building for regulated industries:

| Compliance Profile | Target Customer | Automated AST + Schema + Legal Checks Included |
| --- | --- | --- |
| **`--profile hipaa`** *(Healthcare & Clinics)* | MedTech builders, clinic automation agencies | • Verifies all detected Sub-Processors (`subprocessor-map.json`) offer a signed **BAA (Business Associate Agreement)** (flags non-BAA tiers of OpenAI, Resend, or analytics tools).<br>

<br>• Enforces **Zero-Data-Retention (ZDR)** headers on LLM calls.<br>

<br>• Verifies an immutable `audit_logs` table records *every* `SELECT` (read) and mutation on `patient` / `phi` tables.<br>

<br>• Checks session idle timeout $\le 15$ minutes. |
| **`--profile legal-privilege`** *(Law Firms & LegalTech)* | Legal AI / RAG builders, document automation | • Enforces **Matter/Client-Level Cryptographic Isolation** on both SQL rows and Vector DB namespaces.<br>

<br>• Verifies strict **No-Model-Training** clauses and zero third-party telemetry (`PRIV-04` blocks all session replay/pixels).<br>

<br>• Verifies document retention & legal-hold flags (`is_under_legal_hold BOOLEAN` preventing accidental cascade deletion). |
| **`--profile fintech-pci`** *(Accounting, CPA & FinTech)* | Billing tools, financial dashboards, ledger apps | • Enforces double-entry / immutable ledger append-only constraints (blocks `DELETE` or destructive `UPDATE` on `transactions` / `journal_entries` tables).<br>

<br>• Enforces `DECIMAL` / `NUMERIC` or integer-cent types on all currency columns (flags `FLOAT` / `REAL` / JS floating-point math `0.1 + 0.2` bugs on money).<br>

<br>• Enforces strict idempotency keys (`PAY-01`) on all mutation routes. |
| **`--profile eu-ai-act`** *(EU AI Act & ISO 42001)* | European SaaS & Enterprise AI vendors | • Generates an automated **Model Card & System Transparency Log (`AI_INVENTORY.md`)** listing every foundation model, embedding model, reranker, system prompt purpose, and human-in-the-loop override route in the repository. |

---

## 5. How to Architect `RepoContext` v2 for Plug-and-Play Extensions

To support all of the above without slowing down the `<3s` core engine, introduce a **`LanguageAdapter` and `SchemaAdapter` Plugin Interface** inside `packages/core/src/context/adapters.ts`:

```typescript
export interface LanguageAdapter {
  id: "typescript" | "python" | "go" | "rust" | "gdscript" | "csharp";
  fileExtensions: string[];
  lockfiles: string[];
  /** Extracts normalized RouteNodes (URL, method, auth guard status, rate limit) */
  extractRoutes(files: string[], ctx: RepoContext): RouteNode[];
  /** Extracts ORM / Vector DB calls for IDOR and Tenant Isolation checks */
  extractDataQueries(files: string[], ctx: RepoContext): DataQueryNode[];
}

export interface SchemaAdapter {
  id: "postgres-sql" | "prisma" | "drizzle" | "convex" | "firestore" | "qdrant" | "docker-compose";
  matchFiles(filePath: string): boolean;
  /** Populates normalized tables, collections, vector namespaces, or container services */
  parse(files: string[], getText: (f: string) => string): Promise<Partial<RepoContext>>;
}

```

