/**
 * Embedded knowledge bases (compiled into the standalone binary):
 *   data/known-packages.sqlite   — top npm/PyPI packages + SPDX licenses
 *   data/subprocessor-map.json   — SDK / env-key → legal entity, DPA, GDPR category
 */
import type { Database } from "bun:sqlite";
import knownDb from "../../../../data/known-packages.sqlite" with { embed: "true", type: "sqlite" };
import subMap from "../../../../data/subprocessor-map.json";

export interface VendorRecord {
  id: string;
  entityName: string;
  category: string;
  jurisdiction: string;
  privacyPolicyUrl: string;
  dpaUrl: string;
  dataProcessed: string[];
  triggersClauses: string[];
  packages: { npm: string[]; pypi: string[] };
  envKeys: string[];
  /** Compliance flags (null = unknown, verify): signs a HIPAA BAA / offers zero data retention / trains on API inputs by default. */
  baa: boolean | null;
  zdr: boolean | null;
  trainsOnData: boolean | null;
}

export interface KnownPackage {
  ecosystem: "npm" | "pypi";
  name: string;
  rank: number;
  license: string | null;
  license_from_major: number | null;
  weekly_downloads: number | null;
  repo_url: string | null;
  created_at: string | null;
}

const db = knownDb as unknown as Database;
const cache = new Map<string, KnownPackage | null>();
let stmt: ReturnType<Database["query"]> | null = null;

export function lookupKnownPackage(ecosystem: "npm" | "pypi", name: string): KnownPackage | null {
  const key = `${ecosystem}:${name}`;
  if (cache.has(key)) return cache.get(key)!;
  stmt ??= db.query("SELECT * FROM packages WHERE ecosystem = ? AND name = ?");
  const row = (stmt.get(ecosystem, ecosystem === "pypi" ? name.toLowerCase() : name) as KnownPackage | null) ?? null;
  cache.set(key, row);
  return row;
}

const topCache = new Map<string, string[]>();
export function topPackages(ecosystem: "npm" | "pypi", n = 1000): string[] {
  const key = `${ecosystem}:${n}`;
  if (!topCache.has(key)) {
    const rows = db.query("SELECT name FROM packages WHERE ecosystem = ? ORDER BY rank LIMIT ?").all(ecosystem, n) as Array<{ name: string }>;
    topCache.set(
      key,
      rows.map((r) => r.name),
    );
  }
  return topCache.get(key)!;
}

/** Official / vendor-published MCP servers (MCP-02). The seed DB only has the SDKs, not the servers. */
export const OFFICIAL_MCP_SERVERS: Record<"npm" | "pypi", readonly string[]> = {
  npm: [
    "@modelcontextprotocol/server-filesystem",
    "@modelcontextprotocol/server-memory",
    "@modelcontextprotocol/server-everything",
    "@modelcontextprotocol/server-sequential-thinking",
    "@modelcontextprotocol/server-github",
    "@modelcontextprotocol/server-brave-search",
    "@modelcontextprotocol/server-slack",
    "@modelcontextprotocol/server-puppeteer",
    "@modelcontextprotocol/inspector",
    "@playwright/mcp",
    "@upstash/context7-mcp",
    "@supabase/mcp-server-supabase",
    "@stripe/mcp",
    "@sentry/mcp-server",
    "@notionhq/notion-mcp-server",
    "@neondatabase/mcp-server-neon",
    "chrome-devtools-mcp",
    "mcp-remote",
  ],
  pypi: ["mcp-server-fetch", "mcp-server-git", "mcp-server-time", "mcp-server-sqlite"],
};

export function knownPackageCount(): number {
  return (db.query("SELECT count(*) AS n FROM packages").get() as { n: number }).n;
}

export const VENDORS: VendorRecord[] = (subMap as any).vendors;
export const SUBPROCESSOR_MAP_VERSION: string = (subMap as any).version;

const byPkg = new Map<string, VendorRecord>();
for (const v of VENDORS) {
  for (const p of v.packages.npm) byPkg.set(`npm:${p}`, v);
  for (const p of v.packages.pypi) byPkg.set(`pypi:${p.toLowerCase()}`, v);
}

export function vendorForPackage(name: string, ecosystem: "npm" | "pypi" = "npm"): VendorRecord | undefined {
  return byPkg.get(`${ecosystem}:${ecosystem === "pypi" ? name.toLowerCase() : name}`);
}

export function vendorForEnvKey(key: string): VendorRecord | undefined {
  let best: VendorRecord | undefined;
  let bestLen = 0;
  for (const v of VENDORS) {
    for (const prefix of v.envKeys) {
      const match = prefix.endsWith("_") ? key.startsWith(prefix) : key === prefix || key.startsWith(prefix + "_");
      if (match && prefix.length > bestLen) {
        best = v;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

export function vendorById(id: string): VendorRecord | undefined {
  return VENDORS.find((v) => v.id === id);
}

export type DataClientKind = "vector" | "cache";
/** Vector-DB / cache client modules (npm packages and Python import names) → kind + vendor, for `ctx.dataQueries`. */
const DATA_CLIENTS: Record<string, [DataClientKind, string]> = {
  "@qdrant/js-client-rest": ["vector", "qdrant"],
  "@qdrant/js-client-grpc": ["vector", "qdrant"],
  "@qdrant/qdrant-js": ["vector", "qdrant"],
  "@langchain/qdrant": ["vector", "qdrant"],
  qdrant_client: ["vector", "qdrant"],
  "@pinecone-database/pinecone": ["vector", "pinecone"],
  "@langchain/pinecone": ["vector", "pinecone"],
  pinecone: ["vector", "pinecone"],
  chromadb: ["vector", "chroma"],
  "@langchain/community/vectorstores/chroma": ["vector", "chroma"],
  "weaviate-client": ["vector", "weaviate"],
  "weaviate-ts-client": ["vector", "weaviate"],
  "@langchain/weaviate": ["vector", "weaviate"],
  weaviate: ["vector", "weaviate"],
  "@zilliz/milvus2-sdk-node": ["vector", "milvus"],
  "@langchain/community/vectorstores/milvus": ["vector", "milvus"],
  pymilvus: ["vector", "milvus"],
  pgvector: ["vector", "pgvector"],
  "@langchain/community/vectorstores/pgvector": ["vector", "pgvector"],
  "@upstash/vector": ["vector", "upstash"],
  upstash_vector: ["vector", "upstash"],
  "@upstash/redis": ["cache", "upstash"],
  upstash_redis: ["cache", "upstash"],
  "@vercel/kv": ["cache", "upstash"],
  "@redis/client": ["cache", "redis"],
  ioredis: ["cache", "ioredis"],
  redis: ["cache", "redis"],
  "redis.asyncio": ["cache", "redis"],
};

export function dataClientFor(module: string): [DataClientKind, string] | undefined {
  return DATA_CLIENTS[module] ?? DATA_CLIENTS[module.replace(/^(pgvector)\..*$/, "$1")];
}
