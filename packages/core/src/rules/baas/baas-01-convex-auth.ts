import { AUTH_ASSERTION_RE } from "../../context/patterns";
import { defineRule } from "../helpers";

const CONVEX_FILE = /(^|\/)convex\/(?!_generated\/|schema\.|http\.)[\w/.-]+\.[cm]?[jt]s$/;
const CONVEX_AUTH = /\b(?:getUserIdentity|getAuthUserId|getAuthSessionId)\s*\(/;
/** Exports that must never be callable from a browser: the job of `internal*` functions. */
const PRIVILEGED = /admin|webhook|cron|seed|migrat|backfill|purge|wipe|reset|grant|promote|setRole|impersonat/i;
const ALWAYS_INTERNAL = /webhook|cron|seed|migrat|backfill/i;
/** The identity is actually checked: `if (!identity) …`, a throw, or a null comparison. */
const IDENTITY_CHECK = /\bif\s*\(\s*!\s*[\w$]+|\bthrow\b|[!=]==?\s*null\b/;
const ROLE_CHECK = /\brole\b|isAdmin|\badmin\b|permission/i;

export const baas01ConvexAuth = defineRule(
  { id: "BAAS-01", pillar: "SECURITY", severity: "CRITICAL", title: "Public Convex Function Without an Identity Check" },
  (ctx, emit) => {
    const files = ctx.files.all.filter((f) => CONVEX_FILE.test(f));
    // Helpers that read the identity *and* throw when it's missing (`requireUser(ctx)`), across convex/.
    const enforcing = new Set<string>();
    for (const f of files) {
      const ci = ctx.getCode(f);
      for (const fn of ci.functions()) {
        const body = ci.slice(fn.bodyStart, fn.bodyEnd, "masked");
        if (fn.name && CONVEX_AUTH.test(body) && /\bthrow\b/.test(body)) enforcing.add(fn.name);
      }
    }
    const callsHelper = (t: string) => [...enforcing].some((n) => new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\s*\\(`).test(t));

    for (const file of files) {
      const ci = ctx.getCode(file);
      const builders = ci
        .importsFrom(/(^|\/)_generated\/server$/)
        .flatMap((i) => i.names)
        .filter((n) => /^(?:query|mutation|action)$/.test(n));
      if (!builders.length) continue;
      for (const call of ci.calls(new RegExp(`(?<![\\w$.])(?:${builders.join("|")})`))) {
        const name = ci.masked.slice(Math.max(0, call.start - 120), call.start).match(/export\s+(?:const\s+([\w$]+)\s*=|(default))\s*$/);
        if (!name) continue;
        const fn = name[1] ?? "default";
        const kind = call.callee as "query" | "mutation" | "action";
        const first = ci.args(call)[0];
        if (!first) continue;
        let [a, b] = first;
        if (ci.masked[a] === "{") {
          const h = ci.objectEntries(a).find((e) => e.key === "handler");
          if (h) [a, b] = [h.valueStart, h.valueEnd];
        }
        const handler = ci.slice(a, b, "masked");
        const auth = CONVEX_AUTH.exec(handler);
        const authed =
          callsHelper(handler) ||
          /\b(?:require|assert|ensure)\w*(?:User|Auth|Identity|Session|Admin)\w*\s*\(/.test(handler) ||
          (!!auth && IDENTITY_CHECK.test(handler.slice(auth.index))) ||
          (!auth && AUTH_ASSERTION_RE.test(handler) && /\bthrow\b/.test(handler));
        const privileged = PRIVILEGED.test(fn) && (ALWAYS_INTERNAL.test(fn) || !authed || !ROLE_CHECK.test(handler));
        if (authed && !privileged) continue;
        const internal = `internal${kind[0].toUpperCase()}${kind.slice(1)}`;
        emit({
          file,
          line: call.line,
          severity: privileged || kind !== "query" ? "CRITICAL" : "HIGH",
          evidence: ci.snippet(call.start, { after: 2 }),
          impact: privileged
            ? `\`${fn}\` is a public Convex ${kind}, so anyone with the deployment URL (it ships in the client bundle) can call this ${/webhook/i.test(fn) ? "webhook handler with a forged payload" : "privileged operation"} directly from the browser.`
            : `Public Convex ${kind} \`${fn}\` never checks \`ctx.auth.getUserIdentity()\`. Every Convex function is callable by anyone who has the deployment URL, so this ${kind === "query" ? "returns data" : "writes data"} for unauthenticated callers.`,
          agentRemediationPrompt: privileged
            ? `In ${file}:${call.line}, change \`${kind}\` to \`${internal}\` (import it from "./_generated/server") and call it via \`ctx.runMutation(internal.${file
                .replace(/^.*convex\//, "")
                .replace(/\.[cm]?[jt]s$/, "")
                .replace(
                  /\//g,
                  ".",
                )}.${fn}, …)\` from an \`httpAction\` that verifies the webhook signature, a cron, or the dashboard. If users must call it, check the role from the identity and throw otherwise.`
            : `In ${file}:${call.line}, start the handler with \`const identity = await ctx.auth.getUserIdentity(); if (!identity) throw new ConvexError("Unauthenticated");\` and scope every \`ctx.db\` read/write to \`identity.subject\` (or move it to \`${internal}\` if only the backend calls it).`,
        });
      }
    }
  },
);
