/**
 * `ctx.dataQueries`: vector-DB and cache client calls (constructors, searches, upserts, cache reads/writes).
 * Receivers are tracked, not guessed: a call counts only when its root is a name bound from a known client
 * module (knowledge.ts `dataClientFor`), a variable assigned from one of its factories, a handle derived from
 * one (`pc.index("x")`, `client.getCollection()`), or such a variable imported from a local module.
 * pgvector has no client: raw SQL using `<=>`/`<->`/`<#>` and Supabase `rpc("match_*")` count as searches.
 */
import type { CodeIndex } from "./code-index";
import { type DataClientKind, dataClientFor } from "./knowledge";
import { resolveLocalImport } from "./routes";
import type { DataQuery } from "./types";

type Binding = [DataClientKind, string];
const FACTORY_METHOD = /^(?:[A-Z][\w$]*|create\w*|connect\w*|client|from\w*|initialize|init)$/;
const HANDLE_METHOD =
  /^(?:index|Index|namespace|collection|Collection|getCollection|getOrCreateCollection|get_collection|get_or_create_collection|use|pipeline|multi)$/;
const VECTOR_SEARCH =
  /^(?:search|query|similaritySearch\w*|similarity_search\w*|maxMarginalRelevanceSearch|max_marginal_relevance_search|nearText|nearVector|nearObject|near_text|near_vector|hybrid|hybridSearch|hybrid_search|bm25|query_points|query_points_groups|search_batch|search_groups|asRetriever|as_retriever)$/;
const VECTOR_UPSERT =
  /^(?:upsert|add|addDocuments|add_documents|addVectors|add_texts|addTexts|insert|insertMany|insert_many|upsert_points|upload_points|upload_records|upsertRecords|upsert_records)$/;
const CACHE_WRITE = /^(?:set|setex|psetex|setnx|hset|hsetnx|hmset|mset|getset|lpush|rpush|sadd|zadd|incr|incrby|hincrby|xadd)$/;
const CACHE_READ = /^(?:get|mget|hget|hgetall|hmget|getdel|getex|lrange|smembers|zrange|exists)$/;
const PGVECTOR_OP = /<=>|<->|<#>/g;
const SQL_SINK = /(?:\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?|\bsql|\.execute|\.query|\.raw|\.unsafe)\s*(?:<[^>]*>)?\s*[`(]/g;
const esc = (s: string) => s.replace(/[$.]/g, "\\$&");

function opFor(kind: DataClientKind, method: string): DataQuery["op"] | null {
  if (kind === "vector") return VECTOR_SEARCH.test(method) ? "search" : VECTOR_UPSERT.test(method) ? "upsert" : null;
  return CACHE_WRITE.test(method) ? "write" : CACHE_READ.test(method) ? "read" : null;
}

/** Names bound by the file's imports of known client modules. */
function moduleBindings(ci: CodeIndex): Map<string, Binding> {
  const out = new Map<string, Binding>();
  for (const imp of ci.imports()) {
    if (imp.typeOnly) continue;
    const b = dataClientFor(imp.source);
    if (!b) continue;
    const names = [...imp.names, imp.defaultName, imp.namespace].filter(Boolean) as string[];
    if (ci.lang === "py" && !imp.names.length) names.push(imp.source.split(".")[0]);
    for (const n of names) out.set(n, b);
  }
  return out;
}

export function collectDataQueries(files: string[], getCode: (f: string) => CodeIndex, hasFile: (f: string) => boolean): DataQuery[] {
  const out: DataQuery[] = [];
  const code = files.filter((f) => /\.((m|c)?[jt]sx?|py)$/.test(f));
  const bindingsCache = new Map<string, Map<string, Binding>>();
  /** Every receiver usable in `file`: module bindings, factory results, derived handles, local imports. */
  const receivers = (file: string, depth = 0): Map<string, Binding> => {
    const hit = bindingsCache.get(file);
    if (hit) return hit;
    const ci = getCode(file);
    const recv = moduleBindings(ci);
    bindingsCache.set(file, recv); // set before recursing: import cycles see a partial map, never loop
    if (depth < 2 && ci.lang !== "py")
      for (const imp of ci.imports()) {
        const local = imp.typeOnly ? null : resolveLocalImport(file, imp.source, hasFile);
        if (!local) continue;
        const theirs = receivers(local, depth + 1);
        if (!theirs.size) continue;
        for (const n of imp.names) if (theirs.has(n)) recv.set(n, theirs.get(n)!);
        if (imp.defaultName) recv.set(imp.defaultName, theirs.values().next().value!);
      }
    if (!recv.size) return recv;
    // factory results and derived handles, in source order so `const idx = pc.index()` after `const pc = new Pinecone()` resolves
    const bind =
      /(?:\b(?:const|let|var)\s+)?([\w$]+)\s*(?::\s*[\w$<>.,\s[\]]+)?=\s*(?:await\s+)?(?:new\s+)?([\w$]+)((?:\.[\w$]+(?:\([^()]*\))?)*)\s*(?:<[^>()]*>)?\s*\(/g;
    for (const m of ci.masked.matchAll(bind)) {
      const root = recv.get(m[2]);
      if (!root) continue;
      const last = m[3] ? (m[3].match(/\.([\w$]+)(?:\([^()]*\))?$/)?.[1] ?? "") : m[2];
      if (!m[3] || FACTORY_METHOD.test(last) || HANDLE_METHOD.test(last)) recv.set(m[1], root);
    }
    return recv;
  };

  for (const file of code) {
    const ci = getCode(file);
    const recv = receivers(file);
    const push = (start: number, open: number, close: number, kind: DataClientKind, vendor: string, op: DataQuery["op"], method: string) =>
      out.push({ file, line: ci.lineOf(start), start, openParen: open, closeParen: close, kind, vendor, op, method });
    if (recv.size) {
      const seen = new Set<number>();
      for (const [name, [kind, vendor]] of recv) {
        const re = new RegExp(`(?<![\\w$.])(?:new\\s+)?${esc(name)}(?:\\.[\\w$]+(?:\\([^()]*\\))?)*`);
        for (const call of ci.calls(re)) {
          if (seen.has(call.start)) continue;
          const isNew = call.callee.startsWith("new");
          const segs = call.callee
            .replace(/^new\s+/, "")
            .replace(/\([^()]*\)/g, "")
            .split(".");
          const method = segs[segs.length - 1];
          const op = isNew || FACTORY_METHOD.test(method) ? "client" : opFor(kind, method);
          if (!op || (op === "client" && HANDLE_METHOD.test(method))) continue;
          seen.add(call.start);
          push(call.start, call.openParen, call.closeParen, kind, vendor, op, method);
        }
      }
    }
    // pgvector: distance operators inside SQL string literals, attributed to the nearest preceding SQL sink
    const nc = ci.noComments;
    if (/<=>|<->|<#>/.test(nc)) {
      const sinks = [...nc.matchAll(SQL_SINK)];
      const seen = new Set<number>();
      for (const m of nc.matchAll(PGVECTOR_OP)) {
        if (ci.masked[m.index] === nc[m.index]) continue; // not inside a string
        const sink = sinks.filter((s) => s.index < m.index && m.index - s.index < 4000).pop();
        if (!sink || seen.has(sink.index)) continue;
        seen.add(sink.index);
        const open = sink.index + sink[0].length - 1;
        const close = nc[open] === "(" ? ci.matchClose(open) : nc.indexOf("`", open + 1);
        push(sink.index, open, close, "vector", "pgvector", "search", nc.slice(sink.index).match(/[\w$]+/)?.[0] ?? "sql");
      }
    }
    for (const call of ci.calls(/\.rpc/)) {
      const a = ci.args(call)[0];
      const fn = a ? ci.stringAt(a[0]) : null;
      if (fn && /match|similar|semantic|vector|embedding|nearest|knn/i.test(fn))
        push(call.start, call.openParen, call.closeParen, "vector", "pgvector", "search", "rpc");
    }
  }
  return out;
}
