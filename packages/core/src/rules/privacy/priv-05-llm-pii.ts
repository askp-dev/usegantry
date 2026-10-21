import { GENAI_PACKAGES, PII_FIELD_NAMES, PII_RECORD } from "../../context/patterns";
import { defineRule } from "../helpers";

const LLM_CALLS =
  /\b(?:\w+\.)*(?:chat\.completions\.create|completions\.create|responses\.create|messages\.create|messages\.stream)|(?<![\w.])(?:generateText|streamText|generateObject|streamObject)/;
const PII = new RegExp(`JSON\\.stringify\\(\\s*${PII_RECORD}\\b|\\.(?:${PII_FIELD_NAMES})\\b`);
const ANON = /anonymi[sz]e|pseudonym|redact|maskPII|stripPII|scrub/i;

export const priv05LlmPii = defineRule(
  { id: "PRIV-05", pillar: "PRIVACY", severity: "MEDIUM", title: "Unmasked User PII Serialized into External LLM Prompts" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      if (!/\.(m|c)?[tj]sx?$/.test(file)) continue;
      const ci = ctx.getCode(file);
      if (!ci.imports().some((i) => GENAI_PACKAGES.test(i.source) || /\/(openai|anthropic|ai|llm)$/.test(i.source))) continue;
      for (const call of ci.calls(LLM_CALLS)) {
        let text = ci.slice(call.openParen, call.closeParen + 1, "noComments");
        // prompt/messages built in a variable earlier in the same function (shorthand or bare identifier value)
        if (
          /(?:^|[{,])\s*(?:messages|prompt|input|system)\s*[,}]|\b(?:messages|prompt|input|system)\s*:\s*[\w$]+\s*[,}]/.test(
            ci.slice(call.openParen, call.closeParen + 1, "masked"),
          )
        ) {
          const fn = ci.enclosingFunction(call.start);
          if (fn) text = ci.slice(fn.bodyStart, call.closeParen + 1, "noComments");
        }
        const m = PII.exec(text);
        if (!m || ANON.test(text)) continue;
        emit({
          file,
          line: call.line,
          evidence: `${ci.snippet(call.start, { after: 0 })}\n… ${m[0]} …`,
          impact: `Direct user identifiers (\`${m[0]}\`) are sent to a third-party LLM. That's an undisclosed transfer of personal data, which may be logged or retained by the provider and can leak into other users' outputs.`,
          agentRemediationPrompt: `In ${file}:${call.line}, build the prompt from a minimal projection: \`const ctxUser = { id: anonId(user.id), plan: user.plan }\`. Drop email, phone, IP and full name (or replace them with placeholders like \`<EMAIL_1>\` and re-hydrate after the response).`,
        });
      }
    }
  },
);
