import { defineRule, lineAt } from "../helpers";

/** Buckets whose names suggest user content (public = enumerable by URL). */
const PRIVATE_BUCKET = /user|upload|private|document|attachment|invoice|receipt|avatar|file|media|backup|export|kyc|identity|passport|contract|report|secret/i;

export const sec04StorageBuckets = defineRule(
  { id: "SEC-04", pillar: "SECURITY", severity: "HIGH", title: "Publicly Writable or Enumerable Storage Buckets" },
  (ctx, emit) => {
    for (const b of ctx.sql.buckets) {
      if (!b.public || !PRIVATE_BUCKET.test(b.id)) continue;
      emit({
        file: b.file,
        line: b.line,
        evidence: b.statement.trim(),
        impact: `Bucket \`${b.id}\` is public. Anyone with (or guessing) an object path can download user files with no auth.`,
        agentRemediationPrompt: `In a new migration, run \`update storage.buckets set public = false where id = '${b.id}';\` and serve files via \`supabase.storage.from('${b.id}').createSignedUrl(path, 60)\` from a server route that checks ownership.`,
      });
    }
    for (const p of ctx.sql.storagePolicies) {
      if (p.command === "SELECT") continue;
      const expr = `${p.usingExpr} ${p.checkExpr}`;
      const anon = /\b(anon|public)\b/i.test(p.roles);
      const unscoped = !/auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)\s*=\s*'authenticated'/i.test(expr);
      if (!anon && !unscoped) continue;
      emit({
        file: p.file,
        line: p.line,
        evidence: `policy "${p.name}" for ${p.command}${p.roles ? ` to ${p.roles}` : ""} (${expr.trim()})`,
        impact: `Storage policy "${p.name}" lets ${anon ? "unauthenticated visitors" : "any user"} ${p.command.toLowerCase()} objects without an ownership check, so attackers can upload malware or overwrite other users' files.`,
        agentRemediationPrompt: `In ${p.file}:${p.line}, restrict policy "${p.name}" \`to authenticated\` and scope it by folder: \`with check (bucket_id = '<bucket>' and (storage.foldername(name))[1] = (select auth.uid())::text)\`.`,
      });
    }
    for (const f of ctx.files.all.filter((x) => /(^|\/)storage\.rules$/.test(x))) {
      const text = ctx.getText(f);
      for (const m of text.matchAll(/allow\s+[^;]*\b(write|create|update|delete)\b[^;]*:\s*if\s+true\s*;/g)) {
        emit({
          file: f,
          line: lineAt(text, m.index!),
          evidence: m[0],
          impact: "Firebase Storage rule allows anyone to write any object.",
          agentRemediationPrompt: `In ${f}, replace \`if true\` with \`if request.auth != null && request.auth.uid == userId\` scoped to a \`/users/{userId}/...\` match path.`,
        });
      }
    }
  },
);
