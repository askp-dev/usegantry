import { PLACEHOLDER_RE } from "../../context/patterns";
import { defineRule, lineAt } from "../helpers";

const page = (slug: string) =>
  new RegExp(
    `(^|/)(?:src/)?(?:app|pages|routes)/(?:.*/)?(?:${slug})(?:/(?:page|index|\\+page)\\.\\w+|\\.(?:tsx|jsx|ts|js|mdx|md|svelte|vue|astro|html))$|(^|/)(?:public|static)/(?:${slug})(?:\\.html|/index\\.html)$`,
  );
const ROUTES: Array<{ name: string; slug: string; re: RegExp }> = [
  { name: "/privacy", slug: "privacy", re: page("privacy|privacy-policy") },
  { name: "/terms", slug: "terms", re: page("terms|terms-of-service|tos|eula") },
];

export const leg05LegalRoutes = defineRule(
  { id: "LEG-05", pillar: "LEGAL", severity: "MEDIUM", title: "Missing or Unpopulated Public Legal Routes (/terms, /privacy, /eula)" },
  (ctx, emit) => {
    const web = ctx.framework === "nextjs" || ctx.framework === "sveltekit" || ctx.files.frontendComponents.length > 0;
    const pages: string[] = [];
    if (web) {
      for (const r of ROUTES) {
        const found = ctx.files.all.filter((f) => r.re.test(f));
        pages.push(...found);
        if (!found.length) {
          emit({
            file: ctx.files.all.find((f) => /(^|\/)(app|src\/app|src\/routes|pages)\/(layout|\+layout|_app)\.\w+$/.test(f)) ?? "package.json",
            line: 1,
            evidence: `no public ${r.name} page (looked under app/, pages/, src/routes/, public/)`,
            impact: `There's no ${r.name} page. Stripe, app stores, OAuth consent screens (Google, Apple) and GDPR all require publicly reachable legal pages.`,
            agentRemediationPrompt: `Scaffold a ${r.name} page that renders the compiled \`${ctx.config.legalDir}/${r.slug === "privacy" ? "privacy-policy" : "terms"}.md\` (e.g. Next: \`app${r.name}/page.tsx\` reading the file at build time and rendering it with a markdown component). Link it from the global footer and the signup form.`,
          });
          continue;
        }
        const linked = ctx.files.frontendComponents.some(
          (f) =>
            !found.includes(f) &&
            new RegExp(`["'\`{]\\s*/(?:${r.slug}|${r.slug === "privacy" ? "privacy-policy" : "terms-of-service|tos|eula"})["'\`/?#]`).test(ctx.getText(f)),
        );
        if (!linked)
          emit({
            file: found[0],
            line: 1,
            evidence: `${r.name} exists (${found[0]}) but no component links to it`,
            impact: `Users can't find ${r.name}. Clickwrap and notice obligations require it to be linked from the footer and the signup flow.`,
            agentRemediationPrompt: `Add \`<a href="${r.name}">\` links to the global footer component and next to the signup terms checkbox.`,
          });
      }
    }
    for (const f of new Set([...ctx.files.legalDocs, ...pages])) {
      const text = ctx.getText(f);
      const m = PLACEHOLDER_RE.exec(text);
      if (!m) continue;
      emit({
        file: f,
        line: lineAt(text, m.index),
        evidence: text.split("\n")[lineAt(text, m.index) - 1].trim(),
        impact: `Published legal text still contains the placeholder "${m[0]}". That makes the document unenforceable and looks unprofessional to customers and reviewers.`,
        agentRemediationPrompt: `In ${f}, replace every placeholder ([COMPANY NAME], TODO, TBD, lorem ipsum) with real values. Set \`companyName\`/\`contactEmail\` in preflight.config.json and run \`preflight legal --apply\` to fill the generated sections.`,
      });
    }
  },
);
