import { defineRule, lineAt, openingTags, snake, USER_TABLE_RE } from "../helpers";

const SIGNUP_FILE = /sign-?up|register|onboard|join|create-account/i;
const TERMS_INPUT = /terms|agree|tos|consent|legal|eula|accept/i;

export const leg03ClickwrapSchema = defineRule(
  { id: "LEG-03", pillar: "LEGAL", severity: "HIGH", title: "Missing Database-Bound Clickwrap Consent Trail", scope: "repo" },
  (ctx, emit) => {
    const users = [...ctx.dbTables.values()].filter((t) => USER_TABLE_RE.test(t.name) && !t.name.startsWith("auth."));
    if (users.length && !users.some((t) => ["accepted_terms_at", "accepted_terms_version"].every((c) => t.columns.some((x) => snake(x.name) === c)))) {
      const t = users.find((x) => /^users?$/i.test(x.name)) ?? users[0];
      emit({
        file: t.file,
        line: t.line,
        nodeRef: `table:${t.name}`,
        title: "Missing Database-Bound Clickwrap Consent Trail (schema)",
        evidence: `table ${t.name}: no accepted_terms_at (timestamptz) + accepted_terms_version (text) columns`,
        impact: "You can't prove which version of your terms a user accepted, or when. In a dispute or chargeback, an unprovable clickwrap is unenforceable.",
        agentRemediationPrompt: `Add \`accepted_terms_at timestamptz\` and \`accepted_terms_version text\` to \`${t.name}\` (Prisma: \`acceptedTermsAt DateTime?\` / \`acceptedTermsVersion String?\`), set both in the signup mutation from \`CURRENT_LEGAL_VERSION\`, and force re-acceptance when the stored version differs.`,
      });
    }
    const usesVersion = ctx.files.all.some(
      (f) => /\.(m|c)?[tj]sx?$|\.svelte$|\.vue$/.test(f) && !/legal-version\.[tj]s$/.test(f) && ctx.getText(f).includes("CURRENT_LEGAL_VERSION"),
    );
    for (const file of ctx.files.frontendComponents.filter((f) => SIGNUP_FILE.test(f))) {
      const text = ctx.getCode(file).noComments;
      if (!/<form\b|onSubmit|signUp|signup|createUser/i.test(text)) continue;
      const boxes = openingTags(text, /^input$/i).filter((t) => /type\s*=\s*["'{]?\s*["']?checkbox/.test(t.attrs));
      const terms = boxes.find((b) => TERMS_INPUT.test(b.attrs) || TERMS_INPUT.test(text.slice(b.start, b.start + b.attrs.length + 120)));
      let problem: string | null = null;
      if (!terms) problem = "no terms-acceptance checkbox in the signup form";
      else if (/\b(defaultChecked|checked)(?!\s*=\s*\{\s*false\s*\})\b/.test(terms.attrs)) problem = "the terms checkbox is pre-checked";
      else if (!/\brequired\b/.test(terms.attrs) && !usesVersion) problem = "the checkbox isn't required";
      else if (!usesVersion) problem = "acceptance isn't recorded against CURRENT_LEGAL_VERSION";
      if (!problem) continue;
      emit({
        file,
        line: terms ? lineAt(text, terms.start) : 1,
        title: "Missing Database-Bound Clickwrap Consent Trail (signup UI)",
        evidence: terms ? `<input${terms.attrs}>  (${problem})` : problem,
        impact: `${problem[0].toUpperCase()}${problem.slice(1)}. Courts routinely refuse to enforce pre-checked or browsewrap consent, so your terms (liability caps, arbitration) may not bind users.`,
        agentRemediationPrompt: `In ${file}, render an unchecked, required checkbox \`<input type="checkbox" name="acceptTerms" required />\` with a label linking to /terms and /privacy. In the signup action, validate \`acceptTerms === "on"\` with Zod and persist \`accepted_terms_at = now()\` and \`accepted_terms_version = CURRENT_LEGAL_VERSION\` (import it from the generated legal-version module).`,
      });
    }
  },
);
