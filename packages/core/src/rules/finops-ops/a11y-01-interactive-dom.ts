import { defineRule, hasAttr, lineAt, openingTags } from "../helpers";

const CLICK = /onClick|on:click|onclick|@click|v-on:click/;
const NON_INTERACTIVE = /^(div|span|li|p|section|article|td|tr|img|main|header|footer|label)$/;
const CONTROLS = /^(input|textarea|select)$/;
const LABEL_ATTR = /aria-label|aria-labelledby|title/;

export const a11y01InteractiveDom = defineRule(
  { id: "A11Y-01", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "EAA / ADA Lawsuit Triggers (Interactive A11y Blockers)" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      if (!ctx.files.frontendComponents.includes(file) && !/\.html?$/.test(file)) continue;
      const text = ctx.getCode(file).noComments;
      const forIds = new Set([...text.matchAll(/(?:htmlFor|for)\s*=\s*["'{]\s*["']?([\w-]+)/g)].map((m) => m[1]));
      for (const t of openingTags(text, /^(?:[a-z]+|Image)$/)) {
        let problem: string | null = null;
        let fix = "";
        if (NON_INTERACTIVE.test(t.tag) && t.tag !== "label" && CLICK.test(t.attrs) && !(hasAttr(t.attrs, /role/) && hasAttr(t.attrs, /tabIndex|tabindex/))) {
          problem = `<${t.tag}> with a click handler but no role/tabIndex (keyboard and screen-reader users can't activate it)`;
          fix = `replace the \`<${t.tag}>\` with \`<button type="button">\` (keep the handler and classes), or add \`role="button" tabIndex={0}\` plus an onKeyDown for Enter/Space`;
        } else if ((t.tag === "img" || t.tag === "Image") && !hasAttr(t.attrs, /alt/)) {
          problem = `<${t.tag}> without alt text`;
          fix = 'add a descriptive `alt="…"` (or `alt=""` if purely decorative)';
        } else if (CONTROLS.test(t.tag) && !/type\s*=\s*["']?(hidden|submit|button|reset|image)/.test(t.attrs) && !hasAttr(t.attrs, LABEL_ATTR)) {
          const id = /\bid\s*=\s*["'{]\s*["']?([\w-]+)/.exec(t.attrs)?.[1];
          const before = text.slice(0, t.start);
          const wrapped = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
          if (!(id && forIds.has(id)) && !wrapped) {
            problem = `<${t.tag}> without an accessible label`;
            fix = `add a \`<label htmlFor="…">\` tied to the input's id, or an \`aria-label\``;
          }
        }
        if (!problem) continue;
        const line = lineAt(text, t.start);
        emit({
          file,
          line,
          evidence: `${text.split("\n")[line - 1].trim()}  // ${problem}`,
          impact: `${problem}. This is a WCAG 2.1 A failure and one of the patterns automated ADA/EAA demand-letter scanners look for.`,
          agentRemediationPrompt: `In ${file}:${line}, ${fix}.`,
        });
      }
    }
  },
);
