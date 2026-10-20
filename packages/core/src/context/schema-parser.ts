/**
 * ORM model normalizer: Prisma, Drizzle and SQLAlchemy → TableSchema.
 * RLS is only representable in SQL (and Drizzle's pgPolicy / .enableRLS()), so ORM tables
 * default to rlsEnabled=false unless the same table is also defined in SQL migrations.
 */
import { CodeIndex } from "./code-index";
import { ENCRYPTED_COLUMN_RE, PII_COLUMN_RE, makeLineIndex } from "./sql-parser";
import type { TableSchema } from "./types";

const PRISMA_SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes", "Unsupported"]);

export function parsePrismaSchema(file: string, text: string): TableSchema[] {
  const lineOf = makeLineIndex(text);
  const clean = text.replace(/\/\/.*$/gm, (m) => " ".repeat(m.length));
  const models = new Map<string, { table: TableSchema; relations: Array<{ field: string; target: string; fields: string[]; onDelete?: string; line: number }> }>();
  const enums = new Set<string>();
  for (const em of clean.matchAll(/^\s*enum\s+(\w+)\s*\{/gm)) enums.add(em[1]);
  for (const mm of clean.matchAll(/^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)) {
    const modelName = mm[1];
    const body = mm[2];
    const bodyOffset = mm.index! + mm[0].indexOf("{") + 1;
    const mapM = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const table: TableSchema = { name: mapM?.[1] ?? modelName, file, line: lineOf(mm.index!), rlsEnabled: false, policies: [], columns: [], source: "prisma" };
    (table as any).modelName = modelName;
    const relations: Array<{ field: string; target: string; fields: string[]; onDelete?: string; line: number }> = [];
    let off = 0;
    for (const rawLine of body.split("\n")) {
      const lineOffset = bodyOffset + off;
      off += rawLine.length + 1;
      const line = rawLine.trim();
      if (!line || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!fm) continue;
      const [, fname, ftype, isList, , attrs] = fm;
      const colMap = attrs.match(/@map\(\s*"([^"]+)"\s*\)/)?.[1];
      const rel = attrs.match(/@relation\(([^)]*)\)/);
      if (PRISMA_SCALARS.has(ftype) || enums.has(ftype)) {
        const name = colMap ?? fname;
        const dbType = attrs.match(/@db\.(\w+)/)?.[1];
        table.columns.push({
          name,
          type: dbType ? `${ftype}(@db.${dbType})` : ftype,
          isPII: PII_COLUMN_RE.test(name) || PII_COLUMN_RE.test(fname),
          isEncrypted: ENCRYPTED_COLUMN_RE.test(name),
          onDeleteCascade: false,
          line: lineOf(lineOffset),
        });
        (table.columns[table.columns.length - 1] as any).fieldName = fname;
      } else if (rel && !isList) {
        const fields = rel[1].match(/fields:\s*\[([^\]]*)\]/)?.[1].split(",").map((x) => x.trim()) ?? [];
        const onDelete = rel[1].match(/onDelete:\s*(\w+)/)?.[1];
        relations.push({ field: fname, target: ftype, fields, onDelete, line: lineOf(lineOffset) });
      }
    }
    models.set(modelName, { table, relations });
  }
  // resolve relations to FK columns
  for (const { table, relations } of models.values()) {
    for (const r of relations) {
      const target = models.get(r.target)?.table.name ?? r.target;
      for (const f of r.fields) {
        const col = table.columns.find((c) => (c as any).fieldName === f || c.name === f);
        if (!col) continue;
        col.foreignKeyTable = target;
        const od = r.onDelete ? r.onDelete.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() : undefined;
        col.onDelete = od;
        col.onDeleteCascade = od === "CASCADE";
      }
    }
  }
  return [...models.values()].map((m) => m.table);
}

/** Map Prisma model accessor (prisma.user) → table name. */
export function prismaModelMap(tables: TableSchema[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tables) {
    const model = (t as any).modelName as string | undefined;
    if (!model) continue;
    out.set(model.charAt(0).toLowerCase() + model.slice(1), t.name);
  }
  return out;
}

export function parseDrizzleSchema(file: string, text: string): TableSchema[] {
  const ci = new CodeIndex(text, file);
  const out: TableSchema[] = [];
  const varToTable = new Map<string, string>();
  const pending: Array<{ table: TableSchema; col: TableSchema["columns"][number]; refVar: string }> = [];
  for (const call of ci.calls(/\b(?:pgTable|sqliteTable|mysqlTable|pgTableCreator\([^)]*\))/)) {
    const args = ci.args(call);
    if (args.length < 2) continue;
    const nameLit = ci.noComments.slice(args[0][0], args[0][1]).trim();
    const tableName = nameLit.replace(/^['"`]|['"`]$/g, "");
    const before = ci.masked.slice(Math.max(0, call.start - 80), call.start);
    const varName = before.match(/(?:const|let|var)\s+([\w$]+)\s*=\s*$/)?.[1];
    if (varName) varToTable.set(varName, tableName);
    const table: TableSchema = { name: tableName, file, line: call.line, rlsEnabled: false, policies: [], columns: [], source: "drizzle" };
    const objStart = ci.skipWs(args[1][0]);
    for (const e of ci.objectEntries(objStart)) {
      const v = ci.noComments.slice(e.valueStart, e.valueEnd);
      const cm = v.match(/^(\w+)\(\s*(?:['"`]([^'"`]+)['"`])?/);
      if (!cm) continue;
      const colName = cm[2] ?? e.key;
      const col: TableSchema["columns"][number] = {
        name: colName,
        type: cm[1],
        isPII: PII_COLUMN_RE.test(colName) || PII_COLUMN_RE.test(e.key),
        isEncrypted: ENCRYPTED_COLUMN_RE.test(colName),
        onDeleteCascade: false,
        line: ci.lineOf(e.start),
      };
      const ref = v.match(/\.references\(\s*\(\)\s*(?::\s*\w+\s*)?=>\s*([\w$]+)\.\w+\s*(?:,\s*\{([^}]*)\})?/);
      if (ref) {
        const od = ref[2]?.match(/onDelete:\s*['"]([\w ]+)['"]/)?.[1];
        col.onDelete = od?.toUpperCase();
        col.onDeleteCascade = col.onDelete === "CASCADE";
        pending.push({ table, col, refVar: ref[1] });
      }
      table.columns.push(col);
    }
    // third arg / chained .enableRLS() / pgPolicy(...)
    const tail = ci.masked.slice(call.closeParen, call.closeParen + 40);
    if (/^\)\s*\.enableRLS\(/.test(tail) || /\.withRLS\b/.test(before)) table.rlsEnabled = true;
    if (args[2] && /pgPolicy\s*\(/.test(ci.masked.slice(args[2][0], args[2][1]))) {
      table.rlsEnabled = true;
      for (const pc of ci.calls(/\bpgPolicy/, args[2][0], args[2][1])) {
        const pa = ci.args(pc);
        const pname = ci.noComments.slice(pa[0]?.[0] ?? 0, pa[0]?.[1] ?? 0).replace(/['"`]/g, "");
        const opts = pa[1] ? ci.noComments.slice(pa[1][0], pa[1][1]) : "";
        const cmd = (opts.match(/for:\s*['"](\w+)['"]/)?.[1] ?? "all").toUpperCase();
        const using = opts.match(/using:\s*sql`([^`]*)`/)?.[1] ?? "";
        const check = opts.match(/withCheck:\s*sql`([^`]*)`/)?.[1] ?? "";
        table.policies.push({ name: pname, command: (["SELECT", "INSERT", "UPDATE", "DELETE"].includes(cmd) ? cmd : "ALL") as any, usingExpr: using, checkExpr: check });
      }
    }
    out.push(table);
  }
  for (const p of pending) p.col.foreignKeyTable = varToTable.get(p.refVar) ?? p.refVar;
  (out as any).varToTable = varToTable;
  return out;
}

export function parseSqlAlchemyModels(file: string, text: string): TableSchema[] {
  const ci = new CodeIndex(text, file);
  const out: TableSchema[] = [];
  const s = ci.noComments;
  for (const m of s.matchAll(/^class\s+(\w+)\s*\(([^)]*)\)\s*:\s*$/gm)) {
    const start = m.index! + m[0].length;
    // class body = following indented lines
    const rest = s.slice(start);
    const endRel = rest.search(/\n(?=\S)/);
    const body = endRel === -1 ? rest : rest.slice(0, endRel);
    const tn = body.match(/__tablename__\s*=\s*['"]([^'"]+)['"]/);
    if (!tn) continue;
    const table: TableSchema = { name: tn[1], file, line: ci.lineOf(m.index!), rlsEnabled: false, policies: [], columns: [], source: "sqlalchemy" };
    for (const cm of body.matchAll(/^[ \t]+(\w+)\s*(?::\s*Mapped\[[^\]]*\]\s*)?=\s*(?:Column|mapped_column|db\.Column)\(([^\n]*)\)?\s*$/gm)) {
      const name = cm[1];
      const args = cm[2];
      const fk = args.match(/ForeignKey\(\s*['"]([\w.]+)['"]\s*(?:,\s*ondelete\s*=\s*['"]([\w ]+)['"])?/i);
      const type = args.match(/^\s*(?:['"][^'"]*['"]\s*,\s*)?([A-Z]\w*)/)?.[1] ?? "unknown";
      const od = fk?.[2]?.toUpperCase();
      table.columns.push({
        name,
        type,
        isPII: PII_COLUMN_RE.test(name),
        isEncrypted: ENCRYPTED_COLUMN_RE.test(name) || /EncryptedType|StringEncryptedType/.test(args),
        foreignKeyTable: fk ? fk[1].split(".")[0] : undefined,
        onDelete: od,
        onDeleteCascade: od === "CASCADE",
        line: ci.lineOf(start + (cm.index ?? 0)),
      });
    }
    out.push(table);
  }
  return out;
}
