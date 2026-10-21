/**
 * SchemaAdapter registry: each ORM/DDL source normalizes its files into TableSchema.
 * SQL migrations are authoritative (RLS, policies, buckets); ORM adapters only add tables/columns SQL lacks.
 * To support a new ORM, add one adapter to SCHEMA_ADAPTERS — the builder and rules don't change.
 */
import { parseConvexSchema, parseDrizzleSchema, parsePrismaSchema, parseSqlAlchemyModels, prismaModelMap } from "./schema-parser";
import { parseSqlFiles, parseSupabaseConfigBuckets, type SqlParseResult } from "./sql-parser";
import type { TableSchema } from "./types";

interface SchemaAdapter {
  id: string;
  /** Cheap filter; `text()` reads the (cached) file only when the extension already matched. */
  claims(file: string, text: () => string): boolean;
  parse(file: string, text: string): TableSchema[];
}

const SCHEMA_ADAPTERS: readonly SchemaAdapter[] = [
  { id: "prisma", claims: (f) => f.endsWith(".prisma"), parse: parsePrismaSchema },
  { id: "drizzle", claims: (f, t) => /\.(m|c)?[tj]s$/.test(f) && /\b(pgTable|sqliteTable|mysqlTable)\s*\(/.test(t()), parse: parseDrizzleSchema },
  { id: "sqlalchemy", claims: (f, t) => f.endsWith(".py") && t().includes("__tablename__"), parse: parseSqlAlchemyModels },
  { id: "convex", claims: (f) => /(^|\/)convex\/schema\.[jt]s$/.test(f), parse: parseConvexSchema },
];

interface SchemaResult {
  sql: SqlParseResult;
  dbTables: Map<string, TableSchema>;
  prismaModels: Map<string, string>;
  drizzleVars: Map<string, string>;
}

export function collectSchema(all: string[], sqlMigrations: string[], getText: (f: string) => string, hasFile: (f: string) => boolean): SchemaResult {
  const sql = parseSqlFiles(sqlMigrations.map((f) => ({ file: f, text: getText(f) })));
  if (hasFile("supabase/config.toml")) sql.buckets.push(...parseSupabaseConfigBuckets("supabase/config.toml", getText("supabase/config.toml")));
  const dbTables = sql.tables;
  const byAdapter = new Map<string, TableSchema[]>();
  const drizzleVars = new Map<string, string>();
  for (const a of SCHEMA_ADAPTERS) {
    const tables: TableSchema[] = [];
    for (const f of all) {
      if (!a.claims(f, () => getText(f))) continue;
      const parsed = a.parse(f, getText(f));
      tables.push(...parsed);
      for (const [k, v] of ((parsed as any).varToTable as Map<string, string>) ?? []) drizzleVars.set(k, v);
    }
    byAdapter.set(a.id, tables);
  }
  for (const t of [...byAdapter.values()].flat()) {
    const key = t.name.toLowerCase();
    const existing = dbTables.get(key);
    if (!existing) dbTables.set(key, t);
    else {
      // SQL is authoritative for RLS/policies; merge ORM columns that SQL lacks
      for (const c of t.columns) if (!existing.columns.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) existing.columns.push(c);
      if (!(existing as any).modelName && (t as any).modelName) (existing as any).modelName = (t as any).modelName;
    }
  }
  return { sql, dbTables, prismaModels: prismaModelMap(byAdapter.get("prisma") ?? []), drizzleVars };
}
