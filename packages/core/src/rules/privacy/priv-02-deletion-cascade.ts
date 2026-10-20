import type { TableSchema } from "../../context/types";
import { defineRule, USER_TABLE_RE } from "../helpers";

const DELETE_ACCOUNT_CODE =
  /auth\.admin\.deleteUser|clerkClient\.users\.deleteUser|users\.deleteUser|deleteUser\s*\(|\b(?:prisma|db|tx)\.(?:user|users|profile|account)\.delete\s*\(|\.from\s*\(\s*["'](?:users|profiles|accounts)["']\s*\)\s*\.delete\s*\(/;

export const priv02DeletionCascade = defineRule(
  { id: "PRIV-02", pillar: "PRIVACY", severity: "HIGH", title: "Missing Right-to-Erasure Cascade (GDPR Art. 17)" },
  (ctx, emit) => {
    const tables = [...ctx.dbTables.values()];
    const userTables = tables.filter((t) => USER_TABLE_RE.test(t.name));
    if (!userTables.length) return;
    const userNames = new Set([...userTables.map((t) => t.name.toLowerCase()), "auth.users"]);
    const isUserRef = (fk?: string) => !!fk && userNames.has(fk.toLowerCase().replace(/^public\./, ""));
    for (const t of tables) {
      for (const c of t.columns) {
        if (!isUserRef(c.foreignKeyTable)) continue;
        const action = (c.onDelete ?? "").toUpperCase();
        if (action === "CASCADE" || action === "SET NULL") continue;
        emit({
          file: t.file,
          line: c.line ?? t.line,
          nodeRef: `table:${t.name}`,
          evidence: `${t.name}.${c.name} → ${c.foreignKeyTable} (ON DELETE ${action || "NO ACTION"})`,
          impact: `Deleting a user won't remove their \`${t.name}\` rows (or the delete fails outright), so an erasure request leaves personal data behind, a GDPR Art. 17 violation.`,
          agentRemediationPrompt:
            t.source === "prisma"
              ? `In ${t.file}, add \`onDelete: Cascade\` to the \`@relation(...)\` for \`${c.name}\` on model ${t.name} (use \`SetNull\` and make the field optional for financial records you must retain), then run \`prisma migrate dev\`.`
              : `Add a migration: \`alter table ${t.name} drop constraint <fk_name>, add foreign key (${c.name}) references ${c.foreignKeyTable}(id) on delete cascade;\` (use \`on delete set null\` for invoices/ledgers you must retain).`,
        });
      }
    }
    const hasRoute = ctx.routes.some(
      (r) =>
        (r.method === "DELETE" && /account|user|\/me\b|profile/i.test(r.urlPath)) ||
        (r.method === "SERVER_ACTION" && /delete\w*(account|user|profile|me)\b/i.test(r.handlerName ?? "")),
    );
    const hasCode = hasRoute || ctx.files.serverRoutesAndActions.some((f) => DELETE_ACCOUNT_CODE.test(ctx.getCode(f).masked));
    if (hasCode) return;
    const primary: TableSchema = userTables.find((t) => /^users?$/i.test(t.name)) ?? userTables[0];
    emit({
      file: primary.file,
      line: primary.line,
      nodeRef: `table:${primary.name}`,
      evidence: `user table \`${primary.name}\` exists but no account-deletion route or server action was found`,
      impact:
        "Users can't exercise their right to erasure (GDPR Art. 17 / CCPA). Each request becomes a manual DB job, and missing the 30-day deadline is a reportable violation.",
      agentRemediationPrompt:
        "Scaffold `DELETE /api/user/account` (or a `deleteAccount` server action) that: (1) requires the session, (2) deletes the user's storage objects, (3) deletes the DB user row (FKs cascade), (4) deletes the auth identity (`supabase.auth.admin.deleteUser(id)` / `clerkClient.users.deleteUser(id)`), (5) cancels any Stripe subscription, and (6) returns 204.",
    });
  },
);
