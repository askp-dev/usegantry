import { defineRule } from "../helpers";

/** SQLCipher-style keying on a local database handle. */
const KEYED = /\bencryptionKey\b|pragma\s*\(\s*['"`]\s*(?:key|rekey|cipher)\b|PRAGMA\s+(?:key|cipher)\b/i;
const MEMORY = /^['"`](?::memory:|file::memory:)/;

export const edge01UnencryptedReplica = defineRule(
  { id: "EDGE-01", pillar: "PRIVACY", severity: "HIGH", title: "PII Stored in an Unencrypted Local SQLite / Turso Embedded Replica" },
  (ctx, emit) => {
    const pii = [...ctx.dbTables.values()].flatMap((t) => t.columns.filter((c) => c.isPII && !c.isEncrypted).map((c) => `${t.name}.${c.name}`));
    if (!pii.length) return;
    for (const file of ctx.files.all) {
      if (!/\.(?:[cm]?[jt]sx?|py)$/.test(file) || /\.(?:test|spec|d)\.[cm]?[jt]sx?$|(^|\/)tests?\//.test(file)) continue;
      const text = ctx.getText(file);
      if (!/@libsql\/|@tursodatabase\/|better-sqlite3|bun:sqlite|\bsqlite3\b/.test(text)) continue;
      const ci = ctx.getCode(file);
      const sites: Array<{ pos: number; what: string }> = [];
      if (ci.lang === "js") {
        if (ci.importsFrom(/^@libsql\/client|^@tursodatabase\//).length)
          for (const call of ci.calls(/(?<![\w$.])createClient/)) {
            const a = ci.args(call)[0];
            if (!a || ci.masked[a[0]] !== "{") continue;
            const es = ci.objectEntries(a[0]);
            const url = es.find((e) => e.key === "url");
            const local = es.some((e) => e.key === "syncUrl") || (url && /^['"`]file:/.test(ci.slice(url.valueStart, url.valueEnd, "noComments").trim()));
            if (local && !es.some((e) => e.key === "encryptionKey"))
              sites.push({ pos: call.start, what: es.some((e) => e.key === "syncUrl") ? "Turso embedded replica" : "local libSQL file" });
          }
        if (ci.importsFrom(/^(?:better-sqlite3|bun:sqlite|sqlite3)$/).length && !KEYED.test(ci.noComments))
          for (const call of ci.calls(/\bnew\s+(?:[\w$]+\.)?Database/)) {
            const a = ci.args(call)[0];
            if (a && !MEMORY.test(ci.slice(a[0], a[1], "noComments").trim())) sites.push({ pos: call.start, what: "local SQLite file" });
          }
      } else if (!KEYED.test(ci.noComments))
        for (const call of ci.calls(/\bsqlite3\.connect/)) {
          const a = ci.args(call)[0];
          if (a && !MEMORY.test(ci.slice(a[0], a[1], "noComments").trim())) sites.push({ pos: call.start, what: "local SQLite file" });
        }
      for (const { pos, what } of sites) {
        const line = ci.lineOf(pos);
        emit({
          file,
          line,
          evidence: ci.snippet(pos, { after: 2 }),
          impact: `This ${what} is written to disk unencrypted, and the schema stores PII (${pii.slice(0, 4).join(", ")}${pii.length > 4 ? ", …" : ""}). Anyone with the edge node's disk, a container snapshot, a backup or a leaked \`.db\` file reads every customer's personal data without credentials.`,
          agentRemediationPrompt:
            what === "local SQLite file"
              ? `In ${file}:${line}, open the database with SQLCipher (\`better-sqlite3-multiple-ciphers\` + \`db.pragma(\`key = '\${process.env.DB_ENCRYPTION_KEY}'\`)\` before any query, or \`sqlcipher3\` in Python) with the key from a secret manager, or move PII columns to the primary database.`
              : `In ${file}:${line}, pass \`encryptionKey: process.env.TURSO_ENCRYPTION_KEY\` to \`createClient\` (encryption at rest for the local replica file), keep the key in a secret store rather than the repo, and add the variable to the env schema.`,
        });
      }
    }
  },
);
