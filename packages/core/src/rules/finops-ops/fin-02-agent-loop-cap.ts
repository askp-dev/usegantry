import { GENAI_PACKAGES, LLM_CALL_RE } from "../../context/patterns";
import { defineRule } from "../helpers";

const MAX_STEPS = 15;
const TOOL_LOOP = /tool_calls|tool_use|toolCalls|function_call|stop_reason|finish_reason|requires_action/;

export const fin02AgentLoopCap = defineRule(
  { id: "FIN-02", pillar: "FINOPS_OPS", severity: "CRITICAL", title: "Unbounded Autonomous AI Agent / Tool Loop" },
  (ctx, emit) => {
    const front = new Set(ctx.files.frontendComponents);
    for (const file of ctx.files.all) {
      if (front.has(file) || !/\.(m|c)?[tj]sx?$/.test(file)) continue;
      const ci = ctx.getCode(file);
      if (!ci.imports().some((i) => GENAI_PACKAGES.test(i.source) || /^langchain|^@langchain\//.test(i.source))) continue;
      const fix = (line: number) =>
        `In ${file}:${line}, bound the agent: pass \`maxSteps: 5\` (AI SDK v5: \`stopWhen: stepCountIs(5)\`), \`maxTokens: 2048\` and \`abortSignal: AbortSignal.timeout(30_000)\` to the call, or cap the loop with an explicit iteration counter (≤ ${MAX_STEPS}) plus a wall-clock budget.`;
      for (const call of ci.calls(/(?<![\w.])(?:generateText|streamText)/)) {
        const first = ci.args(call)[0];
        if (!first || ci.masked[first[0]] !== "{") continue;
        const entries = ci.objectEntries(first[0]);
        if (!entries.some((e) => e.key === "tools")) continue;
        const stepsE = entries.find((e) => e.key === "maxSteps" || e.key === "stopWhen");
        const steps = stepsE ? Number(/\d+/.exec(ci.slice(stepsE.valueStart, stepsE.valueEnd, "masked"))?.[0] ?? Number.NaN) : Number.NaN;
        const issues: string[] = [];
        if (!stepsE) issues.push("no maxSteps/stopWhen");
        else if (steps > MAX_STEPS) issues.push(`step cap ${steps} > ${MAX_STEPS}`);
        if (!entries.some((e) => e.key === "abortSignal")) issues.push("no abortSignal timeout");
        if (!issues.length) continue;
        emit({
          file,
          line: call.line,
          evidence: `${ci.snippet(call.start, { after: 0 })}  // ${issues.join(", ")}`,
          impact: `This tool-calling LLM run has ${issues.join(" and ")}. A model stuck in a tool loop keeps calling (and billing) until something external stops it, which can mean hundreds of dollars per runaway request.`,
          agentRemediationPrompt: fix(call.line),
        });
      }
      // Hand-rolled agent loops: while/for loops that call an LLM and branch on tool calls.
      for (const loop of ci.calls(/(?<![\w.])(?:while|for)/)) {
        const open = ci.skipWs(loop.closeParen + 1);
        if (ci.masked[open] !== "{") continue;
        const close = ci.matchClose(open);
        const body = ci.slice(open, close, "masked");
        if (!LLM_CALL_RE.test(body) || !TOOL_LOOP.test(body)) continue;
        const cond = ci.slice(loop.openParen + 1, loop.closeParen, "masked");
        const bound = /(?:<|<=)\s*(\d+)/.exec(cond);
        const capped =
          (bound && Number(bound[1]) <= MAX_STEPS) ||
          /(?:<|<=)\s*(?:MAX_\w+|max\w*)/.test(cond) ||
          /\bbreak\b[\s\S]*\b(?:steps|iterations|i)\s*>=?\s*\d/.test(body);
        if (capped) continue;
        emit({
          file,
          line: loop.line,
          evidence: ci.snippet(loop.start, { after: 0 }),
          impact:
            "This agent loop keeps calling the LLM while the model requests tools, with no iteration cap. A confused model can loop indefinitely and drain your API budget.",
          agentRemediationPrompt: fix(loop.line),
        });
      }
    }
  },
);
