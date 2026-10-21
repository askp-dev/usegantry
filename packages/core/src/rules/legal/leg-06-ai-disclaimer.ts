import { defineRule, lineAt } from "../helpers";

const AI_UI = /\buse(?:Chat|Completion|Assistant|Object)\s*\(|\breadStreamableValue\b|\bstreamUI\b|fetch\s*\(\s*["'`]\/api\/(?:chat|ai|generate|completion)/;
const DISCLOSURE =
  /AI[- ]generated|generated (?:by|with) AI|AI can make mistakes|may (?:be inaccurate|contain (?:errors|mistakes)|make mistakes)|verify important information|AI-powered|powered by AI/i;

export const leg06AiDisclaimer = defineRule(
  { id: "LEG-06", pillar: "LEGAL", severity: "MEDIUM", title: "Missing AI Output Disclaimer & Acceptable Use Clause", scope: "repo" },
  (ctx, emit) => {
    if (!ctx.stack.genAi) return;
    const eula = `${ctx.config.legalDir}/eula.md`;
    const text = ctx.getText(eula);
    if (!text.includes("GANTRY:AUTO:AI_SCHEDULE")) {
      emit({
        file: text ? eula : "package.json",
        line: 1,
        evidence: text ? `${eula} has no GANTRY:AUTO:AI_SCHEDULE block` : `${eula} not found; GenAI SDK in dependencies`,
        impact:
          "Your product ships generative AI with no output-accuracy disclaimer, IP-ownership terms or AI acceptable-use clause, leaving you exposed to liability for hallucinated or infringing outputs.",
        agentRemediationPrompt:
          "Run `gantry legal --sync` to create or patch `legal/eula.md` with the AI Output Liability & IP schedule (GANTRY:AUTO:AI_SCHEDULE), then link /eula from the footer.",
      });
    }
    for (const f of ctx.files.frontendComponents) {
      const t = ctx.getCode(f).noComments;
      const m = AI_UI.exec(t);
      if (!m || DISCLOSURE.test(t)) continue;
      emit({
        file: f,
        line: lineAt(t, m.index),
        evidence: m[0],
        impact:
          "This view renders AI output with no disclosure. The EU AI Act (Art. 50) and FTC guidance expect users to be told when content is machine-generated.",
        agentRemediationPrompt: `In ${f}, add a short caption under the AI output, e.g. \`<p className="text-xs text-muted-foreground">AI-generated. It can make mistakes, so verify important information.</p>\`.`,
      });
    }
  },
);
