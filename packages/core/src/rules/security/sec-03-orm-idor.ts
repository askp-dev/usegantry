import { AUTH_ASSERTION_RE, SESSION_SCOPE_KEYS, WEBHOOK_VERIFY_RE } from "../../context/patterns";
import { defineRule, refersTo, taintedVars } from "../helpers";

const PRISMA_CALL = /\b(?:prisma|db|tx|ctx\.(?:db|prisma))\.\w+\.(?:update|delete|updateMany|deleteMany|findUnique|findUniqueOrThrow)/;
const DRIZZLE_CALL = /\b(?:db|tx|ctx\.db)\.(?:update|delete)/;
/** RHS of `const user = await requireUser()` etc. Token must end there so `getUserById(params.id)` doesn't count. */
const AUTH_CALL = new RegExp(`(?:${AUTH_ASSERTION_RE.source})(?![\\w$])`);
/** Values derived from the authenticated session rather than the client. */
const SESSION_VALUE =
  /\b(?:session|auth|currentUser|claims|viewer|me)\b|\blocals\.(?:user|session)|\bctx\.(?:user|session|auth)|\breq\.(?:user|auth)\b|\brequest\.(?:user|auth)\b|\btoken\.sub\b/;

export const sec03OrmIdor = defineRule(
  { id: "SEC-03", pillar: "SECURITY", severity: "CRITICAL", title: "ORM Insecure Direct Object Reference (IDOR)" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      // Signature-verified webhooks key rows by ids from a signed event, not client input (unverified ones are SEC-08).
      if (ci.lang !== "js" || WEBHOOK_VERIFY_RE.test(ci.masked)) continue;
      const report = (pos: number, keys: string, model: string, op: string) =>
        emit({
          file,
          line: ci.lineOf(pos),
          evidence: ci.snippet(pos, { after: 0 }),
          impact: `\`${model}.${op}\` filters only by ${keys}, a value the client controls. Any signed-in user can read or modify another user's ${model} by changing the id.`,
          agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, compound the where clause with the authenticated owner, e.g. \`where: { id: input.id, userId: session.user.id }\` (use updateMany/deleteMany if the compound key isn't unique, then check \`count === 1\`), with \`session\` obtained from the project's auth helper before this call.`,
        });

      for (const call of ci.calls(PRISMA_CALL)) {
        const [model, op] = call.callee.split(".").slice(-2);
        const first = ci.args(call)[0];
        if (!first || ci.masked[first[0]] !== "{") continue;
        const where = ci.objectEntries(first[0]).find((e) => e.key === "where");
        if (!where) continue;
        const ws = ci.skipWs(where.valueStart);
        if (ci.masked[ws] !== "{") continue; // where is a variable – can't judge statically
        const entries = ci.objectEntries(ws);
        if (!entries.length || entries.some((e) => SESSION_SCOPE_KEYS.test(e.key) || e.spread)) continue;
        const values = entries.map((e) => (e.shorthand ? e.key : ci.slice(e.valueStart, e.valueEnd, "masked"))).join(" ");
        const fn = ci.outerFunction(call.start) ?? ci.enclosingFunction(call.start);
        const sessionVars = fn ? taintedVars(ci, fn.bodyStart, fn.bodyEnd, [], AUTH_CALL) : new Set<string>();
        if (SESSION_VALUE.test(values) || refersTo(values, sessionVars)) continue;
        report(call.start, entries.map((e) => `\`${e.key}\``).join(", "), model, op);
      }

      for (const call of ci.calls(DRIZZLE_CALL)) {
        const after = ci.masked.slice(call.closeParen + 1, call.closeParen + 400);
        const w = /^[\s\S]*?\.where\s*\(/.exec(after);
        if (!w || /;/.test(after.slice(0, w[0].length))) continue;
        const open = call.closeParen + 1 + w[0].length - 1;
        const close = ci.matchClose(open);
        if (close < 0) continue;
        const cond = ci.slice(open + 1, close, "masked");
        const ids = ci.identifiers(open + 1, close);
        if (ids.some((i) => SESSION_SCOPE_KEYS.test(i)) || SESSION_VALUE.test(cond)) continue;
        if (!ids.includes("id")) continue;
        const table = ci.slice(call.openParen + 1, call.closeParen, "masked").trim();
        report(call.start, "`id`", table, call.callee.split(".").pop()!);
      }
    }
  },
);
