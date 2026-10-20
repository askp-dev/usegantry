/**
 * DDL tokenizer for Supabase / Postgres migrations.
 *
 * Extracts tables (columns, FKs, ON DELETE actions), RLS enablement, policies, views
 * (security_invoker), functions (SECURITY DEFINER / search_path / auth checks), storage
 * buckets and storage.objects policies. Statements are applied in file order so later
 * migrations (ALTER TABLE … ENABLE RLS, DROP POLICY, ADD COLUMN) amend earlier ones.
 */
import type { PolicyCommand, SqlFunction, SqlView, StorageBucket, StoragePolicy, TableSchema } from "./types";

export interface SqlStatement {
  text: string; // statement text with comments blanked
  start: number; // offset in file
  line: number;
}

export interface SqlParseResult {
  tables: Map<string, TableSchema>;
  views: SqlView[];
  functions: SqlFunction[];
  buckets: StorageBucket[];
  storagePolicies: StoragePolicy[];
}

export const PII_COLUMN_RE =
  /(^|_)(e?mail|email_address|phone|phone_number|mobile|address|street|city|zip|postal_code|postcode|full_name|first_name|last_name|given_name|family_name|name|surname|dob|date_of_birth|birth_?date|birthday|ssn|social_security|tax_id|national_id|passport|drivers_license|iban|bank_account|card_number|credit_card|ip|ip_address|geo|latitude|longitude|location|avatar_url|gender|ethnicity|religion|health|medical|biometric)($|_)/i;
export const ENCRYPTED_COLUMN_RE = /(encrypted|_enc$|_cipher|ciphertext|_hash$|hashed|_digest$|vault|pgsodium)/i;

const TABLE_SKIP_SCHEMAS = new Set(["auth", "storage", "extensions", "graphql", "graphql_public", "realtime", "supabase_functions", "vault", "pgsodium", "net", "cron", "pg_catalog", "information_schema", "_realtime", "supabase_migrations"]);

/** Split SQL into statements, honoring quotes, dollar-quoting and comments. */
export function splitSqlStatements(sql: string): SqlStatement[] {
  const buf = sql.split("");
  const out: SqlStatement[] = [];
  const lineAt = makeLineIndex(sql);
  let i = 0;
  let stmtStart = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "-" && n === "-") {
      let j = sql.indexOf("\n", i);
      if (j === -1) j = sql.length;
      for (let k = i; k < j; k++) buf[k] = " ";
      i = j;
      continue;
    }
    if (c === "/" && n === "*") {
      let j = sql.indexOf("*/", i + 2);
      j = j === -1 ? sql.length : j + 2;
      for (let k = i; k < j; k++) if (buf[k] !== "\n") buf[k] = " ";
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      i = j === -1 ? sql.length : j + 1;
      continue;
    }
    if (c === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        i = j === -1 ? sql.length : j + tag.length;
        continue;
      }
    }
    if (c === ";") {
      pushStmt(stmtStart, i);
      stmtStart = i + 1;
    }
    i++;
  }
  pushStmt(stmtStart, sql.length);
  return out;

  function pushStmt(a: number, b: number) {
    const raw = buf.slice(a, b).join("");
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return;
    out.push({ text, start: a + lead, line: lineAt(a + lead) });
  }
}

export function makeLineIndex(text: string) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) starts.push(k + 1);
  return (pos: number) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Parse an identifier possibly schema-qualified and quoted: returns {schema, name}. */
export function parseQualifiedName(raw: string): { schema: string | null; name: string } {
  const parts = raw.trim().match(/("([^"]+)"|[A-Za-z_][\w$]*)/g) ?? [];
  const clean = parts.map((p) => p.replace(/^"|"$/g, ""));
  if (clean.length >= 2) return { schema: clean[clean.length - 2].toLowerCase(), name: clean[clean.length - 1] };
  return { schema: null, name: clean[0] ?? raw.trim() };
}

const QNAME = `((?:"[^"]+"|[A-Za-z_][\\w$]*)(?:\\s*\\.\\s*(?:"[^"]+"|[A-Za-z_][\\w$]*))?)`;

/** Extract content of the balanced parenthesis group starting at text[openIdx] === "(" */
export function balanced(text: string, openIdx: number): { inner: string; end: number } | null {
  if (text[openIdx] !== "(") return null;
  let depth = 0;
  let inStr: string | null = null;
  for (let k = openIdx; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { inner: text.slice(openIdx + 1, k), end: k };
    }
  }
  return null;
}

/** Split on top-level commas (outside parens/quotes). Returns [segment, offsetWithinInput]. */
export function splitTopLevelSql(s: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  let depth = 0;
  let inStr: string | null = null;
  let segStart = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') inStr = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push([s.slice(segStart, k), segStart]);
      segStart = k + 1;
    }
  }
  out.push([s.slice(segStart), segStart]);
  return out
    .map(([seg, off]) => {
      const lead = seg.length - seg.trimStart().length;
      return [seg.trim(), off + lead] as [string, number];
    })
    .filter(([seg]) => seg.length > 0);
}

function normCommand(raw: string | undefined): PolicyCommand {
  const c = (raw ?? "ALL").toUpperCase();
  return (["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"].includes(c) ? c : "ALL") as PolicyCommand;
}

function parseOnDelete(s: string): string | undefined {
  const m = s.match(/on\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i);
  return m ? m[1].toUpperCase().replace(/\s+/, " ") : undefined;
}

function refTable(s: string): string | undefined {
  const m = s.match(new RegExp(`references\\s+${QNAME}`, "i"));
  if (!m) return undefined;
  const q = parseQualifiedName(m[1]);
  return q.schema && q.schema !== "public" ? `${q.schema}.${q.name}` : q.name;
}

const COL_STOP = /\s+(not\s+null|null|default|primary\s+key|references|unique|check|generated|constraint|collate)\b/i;

function parseColumnDef(def: string, lineOf: (off: number) => number, baseOffset: number): TableSchema["columns"][number] | null {
  const m = def.match(/^("([^"]+)"|[A-Za-z_][\w$]*)\s+([\s\S]*)$/);
  if (!m) return null;
  const name = m[2] ?? m[1];
  if (/^(constraint|primary|foreign|unique|check|exclude|like)$/i.test(name)) return null;
  const rest = m[3];
  const stop = rest.search(COL_STOP);
  const type = (stop === -1 ? rest : rest.slice(0, stop)).trim().replace(/\s+/g, " ");
  const onDelete = parseOnDelete(rest);
  return {
    name,
    type,
    isPII: PII_COLUMN_RE.test(name),
    isEncrypted: ENCRYPTED_COLUMN_RE.test(name) || /pgsodium|vault\./i.test(rest),
    foreignKeyTable: refTable(rest),
    onDeleteCascade: onDelete === "CASCADE",
    onDelete,
    line: lineOf(baseOffset),
  };
}

function applyTableConstraint(table: TableSchema, def: string) {
  const fk = def.match(/foreign\s+key\s*\(([^)]*)\)\s*(references[\s\S]*)$/i);
  if (!fk) return;
  const cols = fk[1].split(",").map((c) => c.trim().replace(/"/g, ""));
  const ref = refTable(fk[2]);
  const onDelete = parseOnDelete(fk[2]);
  for (const cn of cols) {
    const col = table.columns.find((c) => c.name.toLowerCase() === cn.toLowerCase());
    if (col) {
      col.foreignKeyTable = ref;
      col.onDelete = onDelete;
      col.onDeleteCascade = onDelete === "CASCADE";
    }
  }
}

function extractClause(stmt: string, keyword: RegExp): string {
  const m = keyword.exec(stmt);
  if (!m) return "";
  const open = stmt.indexOf("(", m.index + m[0].length - 1);
  if (open === -1) return "";
  // ensure only whitespace between keyword and "("
  if (stmt.slice(m.index + m[0].length, open).trim() !== "") return "";
  return balanced(stmt, open)?.inner.trim() ?? "";
}

export function parseSqlFiles(files: Array<{ file: string; text: string }>, into?: SqlParseResult): SqlParseResult {
  const res: SqlParseResult = into ?? { tables: new Map(), views: [], functions: [], buckets: [], storagePolicies: [] };
  const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file));
  for (const { file, text } of sorted) parseOne(file, text, res);
  return res;
}

function parseOne(file: string, sql: string, res: SqlParseResult) {
  const lineOf = makeLineIndex(sql);
  for (const st of splitSqlStatements(sql)) {
    const s = st.text;
    const head = s.slice(0, 200).toLowerCase().replace(/\s+/g, " ");

    // CREATE TABLE
    let m = s.match(new RegExp(`^create\\s+(?:(?:global|local)\\s+)?(?:(?:temp|temporary|unlogged)\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${QNAME}\\s*\\(`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      if (q.schema && TABLE_SKIP_SCHEMAS.has(q.schema)) continue;
      const open = m.index! + m[0].length - 1;
      const body = balanced(s, open);
      if (!body) continue;
      const table: TableSchema = { name: q.name, file, line: st.line, rlsEnabled: false, policies: [], columns: [], source: "sql" };
      const existing = res.tables.get(q.name.toLowerCase());
      if (existing && existing.source === "sql") {
        // re-created table: keep policies/rls from before only if not dropped
        table.rlsEnabled = existing.rlsEnabled;
        table.policies = existing.policies;
      }
      const constraints: string[] = [];
      for (const [def, off] of splitTopLevelSql(body.inner)) {
        if (/^(constraint\s|primary\s+key|foreign\s+key|unique\s*\(|unique\s|check\s*\(|exclude\s)/i.test(def)) {
          constraints.push(def);
          continue;
        }
        const col = parseColumnDef(def, lineOf, st.start + open + 1 + off);
        if (col) table.columns.push(col);
      }
      for (const c of constraints) applyTableConstraint(table, c);
      res.tables.set(q.name.toLowerCase(), table);
      continue;
    }

    // ALTER TABLE
    m = s.match(new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QNAME}\\s+([\\s\\S]*)$`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      const t = res.tables.get(q.name.toLowerCase());
      const actions = m[2];
      if (!t) continue;
      for (const [act, off] of splitTopLevelSql(actions)) {
        if (/^enable\s+row\s+level\s+security/i.test(act)) t.rlsEnabled = true;
        else if (/^disable\s+row\s+level\s+security/i.test(act)) t.rlsEnabled = false;
        else if (/^add\s+(column\s+)?(if\s+not\s+exists\s+)?/i.test(act) && !/^add\s+(constraint|foreign|primary|unique|check)/i.test(act)) {
          const def = act.replace(/^add\s+(column\s+)?(if\s+not\s+exists\s+)?/i, "");
          const col = parseColumnDef(def, lineOf, st.start + (s.length - actions.length) + off);
          if (col) {
            t.columns = t.columns.filter((c) => c.name.toLowerCase() !== col.name.toLowerCase());
            t.columns.push(col);
          }
        } else if (/^add\s+(constraint\s+\S+\s+)?foreign\s+key/i.test(act)) {
          applyTableConstraint(t, act);
        } else if (/^drop\s+column\s+(if\s+exists\s+)?/i.test(act)) {
          const cn = act.replace(/^drop\s+column\s+(if\s+exists\s+)?/i, "").split(/\s/)[0].replace(/"/g, "");
          t.columns = t.columns.filter((c) => c.name.toLowerCase() !== cn.toLowerCase());
        } else if (/^alter\s+column\s+/i.test(act)) {
          // ignore type changes
        }
      }
      continue;
    }

    // DROP TABLE
    m = s.match(new RegExp(`^drop\\s+table\\s+(?:if\\s+exists\\s+)?${QNAME}`, "i"));
    if (m) {
      res.tables.delete(parseQualifiedName(m[1]).name.toLowerCase());
      continue;
    }

    // CREATE POLICY
    m = s.match(new RegExp(`^create\\s+policy\\s+("[^"]+"|[A-Za-z_][\\w$]*)\\s+on\\s+${QNAME}([\\s\\S]*)$`, "i"));
    if (m) {
      const pname = m[1].replace(/^"|"$/g, "");
      const q = parseQualifiedName(m[2]);
      const rest = m[3];
      const cmd = normCommand(rest.match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1]);
      const usingExpr = extractClause(rest, /\busing\s*/gi);
      const checkExpr = extractClause(rest, /\bwith\s+check\s*/gi);
      const roles = rest.match(/\bto\s+([\w\s,"]+?)(?=\s+using|\s+with\s+check|$)/i)?.[1]?.trim() ?? "public";
      if (q.schema === "storage") {
        res.storagePolicies.push({ name: pname, command: cmd, usingExpr, checkExpr, roles, file, line: st.line });
        continue;
      }
      const t = res.tables.get(q.name.toLowerCase());
      if (t) {
        t.policies = t.policies.filter((p) => p.name !== pname);
        t.policies.push({ name: pname, command: cmd, usingExpr, checkExpr });
        (t as any)._policyMeta ??= {};
        (t as any)._policyMeta[pname] = { file, line: st.line, roles };
      }
      continue;
    }

    // DROP POLICY
    m = s.match(new RegExp(`^drop\\s+policy\\s+(?:if\\s+exists\\s+)?("[^"]+"|[A-Za-z_][\\w$]*)\\s+on\\s+${QNAME}`, "i"));
    if (m) {
      const pname = m[1].replace(/^"|"$/g, "");
      const q = parseQualifiedName(m[2]);
      if (q.schema === "storage") res.storagePolicies = res.storagePolicies.filter((p) => p.name !== pname);
      const t = res.tables.get(q.name.toLowerCase());
      if (t) t.policies = t.policies.filter((p) => p.name !== pname);
      continue;
    }

    // CREATE VIEW
    m = s.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:(?:temp|temporary)\\s+)?(?:(materialized)\\s+)?(?:recursive\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${QNAME}`, "i"));
    if (m) {
      const q = parseQualifiedName(m[2]);
      if (q.schema && q.schema !== "public") continue;
      const beforeAs = s.split(/\bas\b/i)[0];
      const securityInvoker = /security_invoker\s*=\s*(true|on|1|yes)/i.test(beforeAs);
      res.views = res.views.filter((v) => v.name !== q.name);
      res.views.push({ name: q.name, file, line: st.line, securityInvoker, statement: s.slice(0, 400) });
      if (m[1]) (res.views[res.views.length - 1] as any).materialized = true;
      continue;
    }
    // ALTER VIEW ... SET (security_invoker = true)
    m = s.match(new RegExp(`^alter\\s+view\\s+(?:if\\s+exists\\s+)?${QNAME}\\s+set\\s*\\(([^)]*)\\)`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      const v = res.views.find((x) => x.name === q.name);
      if (v && /security_invoker\s*=\s*(true|on|1|yes)/i.test(m[2])) v.securityInvoker = true;
      continue;
    }

    // CREATE FUNCTION
    m = s.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?function\\s+${QNAME}\\s*\\(`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      // split header vs body ($$ … $$)
      const bodyMatch = s.match(/\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/);
      const body = bodyMatch?.[2] ?? "";
      const header = bodyMatch ? s.replace(bodyMatch[0], " ") : s;
      const fn: SqlFunction = {
        name: q.schema && q.schema !== "public" ? `${q.schema}.${q.name}` : q.name,
        file,
        line: st.line,
        securityDefiner: /\bsecurity\s+definer\b/i.test(header),
        hasSearchPath: /\bset\s+search_path\s*(=|to)/i.test(header),
        hasAuthCheck: /auth\.uid\s*\(\s*\)|auth\.jwt\s*\(\s*\)|auth\.role\s*\(\s*\)|current_setting\s*\(\s*'request\.jwt|raise\s+exception/i.test(body),
        returnsTrigger: /\breturns\s+(event_)?trigger\b/i.test(header),
        executeRevoked: false,
        statement: s.slice(0, 600),
      };
      res.functions = res.functions.filter((f) => f.name !== fn.name);
      res.functions.push(fn);
      continue;
    }
    // ALTER FUNCTION ... SET search_path
    m = s.match(new RegExp(`^alter\\s+function\\s+${QNAME}[\\s\\S]*?set\\s+search_path`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      const f = res.functions.find((x) => x.name === q.name || x.name.endsWith("." + q.name));
      if (f) f.hasSearchPath = true;
      continue;
    }
    // REVOKE EXECUTE ON FUNCTION x FROM public/anon/authenticated
    m = s.match(new RegExp(`^revoke\\s+(?:all|execute)[\\s\\S]*?on\\s+function\\s+${QNAME}[\\s\\S]*?from\\s+([\\w\\s,]+)`, "i"));
    if (m) {
      const q = parseQualifiedName(m[1]);
      const f = res.functions.find((x) => x.name === q.name || x.name.endsWith("." + q.name));
      if (f && /\b(public|anon)\b/i.test(m[2])) f.executeRevoked = true;
      continue;
    }

    // storage.buckets inserts
    if (/^insert\s+into\s+storage\s*\.\s*buckets/i.test(head)) {
      const colsM = s.match(/storage\s*\.\s*buckets\s*\(([^)]*)\)/i);
      const cols = colsM ? colsM[1].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase()) : ["id", "name", "public"];
      const valuesIdx = s.search(/\bvalues\b/i);
      if (valuesIdx === -1) continue;
      let k = s.indexOf("(", valuesIdx);
      while (k !== -1) {
        const grp = balanced(s, k);
        if (!grp) break;
        const vals = splitTopLevelSql(grp.inner).map(([v]) => v.replace(/^'|'$/g, ""));
        const id = vals[cols.indexOf("id")] ?? vals[cols.indexOf("name")] ?? vals[0];
        const pub = (vals[cols.indexOf("public")] ?? "false").toLowerCase();
        res.buckets.push({ id, public: pub === "true" || pub === "t", file, line: lineOf(st.start + k), statement: s.slice(0, 300) });
        k = s.indexOf("(", grp.end);
        const between = s.slice(grp.end + 1, k === -1 ? undefined : k);
        if (k === -1 || !/^\s*,\s*$/.test(between)) break;
      }
      continue;
    }
    // update storage.buckets set public = true where id = 'x'
    m = s.match(/^update\s+storage\s*\.\s*buckets\s+set\s+public\s*=\s*(true|false)\s+where\s+(?:id|name)\s*=\s*'([^']+)'/i);
    if (m) {
      const b = res.buckets.find((x) => x.id === m![2]);
      if (b) b.public = m[1].toLowerCase() === "true";
      continue;
    }
  }
}

/** Parse `supabase/config.toml` [storage.buckets.<name>] public = true blocks. */
export function parseSupabaseConfigBuckets(file: string, text: string): StorageBucket[] {
  const out: StorageBucket[] = [];
  const lineOf = makeLineIndex(text);
  const re = /^\[storage\.buckets\.([\w-]+)\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pub = /^\s*public\s*=\s*true/m.test(m[2]);
    out.push({ id: m[1], public: pub, file, line: lineOf(m.index), statement: m[0].slice(0, 200).trim() });
  }
  return out;
}
