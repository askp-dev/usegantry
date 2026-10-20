import { defineRule, paramNames, taintedVars } from "../helpers";

const LOG_CALL = /(?<![\w.])(?:console\.(?:log|error|warn|info|debug|trace)|logger\.\w+|log\.(?:info|debug|warn|error|trace)|logging\.\w+|print)/;
const CREDENTIAL_ID =
  /^(password|passwd|pwd|secret|clientSecret|client_secret|token|accessToken|access_token|refreshToken|refresh_token|idToken|id_token|apiKey|api_key|ssn|taxId|tax_id|creditCard|credit_card|cardNumber|card_number|cvv|cvc|authorization|cookie|cookies|jwt|privateKey|private_key)$/i;
const WHOLE_RECORD = /^(?:JSON\.stringify\(\s*)?(user|currentUser|profile|customer|account)\s*\)?$/;
const RAW_REQ = /\b(?:req|request)\.(?:body|headers|cookies)\b|\bheaders\s*\(\s*\)|\bcookies\s*\(\s*\)/;
const REDACTED = /\b(?:redactPII|redact|mask|sanitize)\w*\s*\(/;

function why(arg: string, tainted: Set<string>): string | null {
  if (RAW_REQ.test(arg)) return "the raw request body/headers";
  const bare = arg.replace(/^JSON\.stringify\(\s*|\s*\)$/g, "");
  if (/^[\w$]+$/.test(bare) && tainted.has(bare)) return `the raw request payload \`${bare}\``;
  const rec = WHOLE_RECORD.exec(arg);
  if (rec) return `the full \`${rec[1]}\` record`;
  const cred = (arg.match(/[A-Za-z_$][\w$]*/g) ?? []).find((id) => CREDENTIAL_ID.test(id));
  return cred ? `the sensitive field \`${cred}\`` : null;
}

export const priv01PiiLogs = defineRule(
  { id: "PRIV-01", pillar: "PRIVACY", severity: "HIGH", title: "Unredacted PII or Credentials in Application Logs" },
  (ctx, emit) => {
    const front = new Set(ctx.files.frontendComponents);
    for (const file of ctx.files.all) {
      if (front.has(file) || !/\.(m|c)?[tj]s$|\.py$/.test(file) || /\.(test|spec|d)\.[tj]s$|(^|\/)(scripts?|tests?|__tests__)\//.test(file)) continue;
      const ci = ctx.getCode(file);
      if (ci.hasTopDirective("use client") || !LOG_CALL.test(ci.masked)) continue;
      for (const call of ci.calls(LOG_CALL)) {
        const args = ci.args(call).map(([a, b]) => ci.slice(a, b, "masked").trim());
        if (args.some((a) => REDACTED.test(a))) continue;
        const fn = ci.outerFunction(call.start) ?? ci.enclosingFunction(call.start);
        const tainted = fn ? taintedVars(ci, fn.bodyStart, fn.bodyEnd, ci.hasTopDirective("use server") ? paramNames(ci, fn) : []) : new Set<string>();
        const reason = args.map((a) => (a ? why(a, tainted) : null)).find(Boolean);
        if (!reason) continue;
        emit({
          file,
          line: call.line,
          evidence: ci.snippet(call.start, { after: 0 }),
          impact: `This log line writes ${reason} to your log provider. There, PII and credentials are retained, searchable by staff, and in scope for GDPR/CCPA breach notification.`,
          agentRemediationPrompt: `In ${file}:${call.line}, remove the sensitive argument or wrap it in \`redactPII(...)\`, a serializer that keeps only allowlisted keys (id, type, counts) and masks emails, tokens and passwords.`,
        });
      }
    }
  },
);
