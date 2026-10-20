import { defineRule, snake } from "../helpers";

const SENSITIVE_COL =
  /^(access_token|refresh_token|provider_token|provider_refresh_token|id_token|oauth_token|oauth_token_secret|api_key|apikey|secret|client_secret|ssn|social_security_number|tax_id|taxid|tin|iban|account_number|routing_number|card_number|passport_number)$/;
const PLAIN_TYPE = /^(text|varchar|character varying|char|string|citext|nvarchar)/i;

export const priv03TokenEncryption = defineRule(
  { id: "PRIV-03", pillar: "PRIVACY", severity: "MEDIUM", title: "Plaintext Storage of OAuth Tokens & High-Risk Identifiers" },
  (ctx, emit) => {
    const code = ctx.files.all.filter((f) => /\.(m|c)?[tj]sx?$|\.py$/.test(f));
    const sql = ctx.files.sqlMigrations.map((f) => ctx.getText(f)).join("\n");
    for (const t of ctx.dbTables.values()) {
      for (const c of t.columns) {
        const name = snake(c.name);
        if (!SENSITIVE_COL.test(name) || c.isEncrypted || !PLAIN_TYPE.test(c.type)) continue;
        const enc = new RegExp(
          `(?:encrypt\\w*|seal|cipher\\w*)\\s*\\([^)]*\\b(?:${c.name}|${name})\\b|\\b(?:${c.name}|${name})\\s*:\\s*(?:await\\s+)?(?:encrypt|seal)\\w*\\s*\\(`,
          "i",
        );
        if (code.some((f) => enc.test(ctx.getText(f))) || new RegExp(`pgsodium[\\s\\S]{0,200}\\b${name}\\b|vault\\.[\\w.]*\\b${name}\\b`, "i").test(sql))
          continue;
        emit({
          file: t.file,
          line: c.line ?? t.line,
          nodeRef: `table:${t.name}`,
          evidence: `${t.name}.${c.name} ${c.type} (plaintext)`,
          impact: `\`${t.name}.${c.name}\` stores a credential or high-risk identifier in plain text. One SQL injection, leaked backup or over-broad policy exposes every user's linked account.`,
          agentRemediationPrompt: `Create \`lib/crypto.ts\` with \`encryptField(plain)\` / \`decryptField(blob)\` using AES-256-GCM (node:crypto, random 12-byte IV, key from \`process.env.FIELD_ENCRYPTION_KEY\`, output \`iv.tag.ciphertext\` base64). Wrap every write and read of \`${t.name}.${c.name}\`, and backfill existing rows in a one-off script. Alternatively store it in Supabase Vault.`,
        });
      }
    }
  },
);
