import { normalizeCondition, parseFirebaseRules } from "../../context/firestore-rules";
import { defineRule } from "../helpers";

const AUTH_ONLY = /^(?:request\.auth(?:\.uid)?!=null|null!=request\.auth(?:\.uid)?)$/;
/** Test-mode defaults: no condition, `if true`, or a `request.time < timestamp.date(...)` expiry. */
const OPEN = /^(?:true|request\.time<(?:timestamp\.date\([^)]*\)|[\w.()]+))$/;
const WRITES = /^(?:write|create|update|delete)$/;

export const baas02FirestoreRules = defineRule(
  { id: "BAAS-02", pillar: "SECURITY", severity: "CRITICAL", title: "Firebase Security Rules Grant Any Signed-In User Access to Everything" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      if (!/(^|\/)(?:firestore|storage)(?:\.[\w-]+)?\.rules$/.test(file)) continue;
      const lines = ctx.getText(file).split("\n");
      for (const a of parseFirebaseRules(ctx.getText(file))) {
        const cond = normalizeCondition(a.condition);
        const open = OPEN.test(cond);
        const authOnly = AUTH_ONLY.test(cond);
        if (!open && !(authOnly && (a.recursive || a.methods.some((m) => WRITES.test(m))))) continue;
        const who = open ? "anyone on the internet (no sign-in needed)" : "any signed-in user (and anyone can sign up)";
        const scope = a.recursive ? `every document under \`${a.path}\`` : `every document matching \`${a.path}\`, including other users' records`;
        emit({
          file,
          line: a.line,
          severity: open || a.recursive ? "CRITICAL" : "HIGH",
          evidence: lines.slice(Math.max(0, a.line - 2), a.line).join("\n"),
          impact: `\`allow ${a.methods.join(", ")}\` lets ${who} ${a.methods.some((m) => WRITES.test(m)) ? "read and overwrite" : "read"} ${scope}. The Firebase client config is public, so this is reachable straight from the browser console.`,
          agentRemediationPrompt: `In ${file}:${a.line}, replace the ${open ? "open/test-mode" : "`request.auth != null`-only"} rule${a.recursive ? " and remove the `{document=**}` catch-all" : ""}: add one \`match /<collection>/{docId}\` block per collection that checks ownership, e.g. \`allow read, update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid; allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;\`. Deny everything else by default.`,
        });
      }
    }
  },
);
