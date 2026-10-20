import type { CodeIndex } from "../../context/code-index";
import { defineRule } from "../helpers";

const NETWORK = /\bfetch\s*\(|\baxios\b|\bsupabase\b|\btrpc\.|\buseQuery\b|\.from\s*\(|\$fetch\s*\(|\bky\s*[.(]|\bapi\.\w+\s*\(|\bmutate\w*\s*\(|\bprisma\./;

function report(ci: CodeIndex, file: string, pos: number, dep: string) {
  return {
    file,
    line: ci.lineOf(pos),
    evidence: ci.snippet(pos, { after: 0 }),
    impact: `The effect fetches data and then updates \`${dep}\`, which is also its own dependency. Every response re-triggers the effect: an infinite request loop that hammers your API/DB and can burn your Supabase/Vercel quota in minutes.`,
    agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, remove \`${dep}\` from the dependency array (depend only on the inputs of the request, e.g. \`[filters.q]\`), memoize object/array deps with useMemo, or move fetching to TanStack Query / SWR / a Server Component.`,
  };
}

export const fin01InfiniteLoop = defineRule(
  { id: "FIN-01", pillar: "FINOPS_OPS", severity: "CRITICAL", title: "Frontend Infinite Fetch / Database Render Loop" },
  (ctx, emit) => {
    for (const file of ctx.files.frontendComponents) {
      const ci = ctx.getCode(file);
      const src = ci.masked;
      if (ci.lang === "js") {
        const setters = new Map<string, string>(); // setter -> state
        for (const m of src.matchAll(/\[\s*([\w$]+)\s*,\s*(set[\w$]+)\s*\]\s*=\s*(?:React\.)?use(?:State|Reducer)\b/g)) setters.set(m[2], m[1]);
        for (const call of ci.calls(/(?<![\w.])(?:React\.)?use(?:Layout)?Effect/)) {
          const [fnArg, depsArg] = ci.args(call);
          if (!fnArg || !depsArg) continue;
          const body = ci.slice(fnArg[0], fnArg[1], "masked");
          const deps = ci.slice(depsArg[0], depsArg[1], "masked").trim();
          if (!NETWORK.test(body) || !deps.startsWith("[")) continue;
          const depIds = new Set(ci.identifiers(depsArg[0], depsArg[1]));
          let hit: string | null = /\[\s*[{[]|,\s*[{[]/.test(deps) ? "an inline object/array literal" : null;
          for (const [setter, state] of setters) if (!hit && depIds.has(state) && new RegExp(`\\b${setter}\\s*\\(`).test(body)) hit = state;
          if (!hit) {
            // unmemoized object/array declared in the component body and listed as a dep
            const comp = ci.enclosingFunction(call.start);
            const compBody = comp ? ci.slice(comp.bodyStart, call.start, "masked") : "";
            hit = [...depIds].find((d) => new RegExp(`\\b(?:const|let)\\s+${d}\\s*=\\s*[{[]`).test(compBody)) ?? null;
          }
          if (hit) emit(report(ci, file, call.start, hit));
        }
      } else if (ci.lang === "svelte") {
        const states = [...src.matchAll(/\blet\s+([\w$]+)\s*=\s*\$state\s*\(/g)].map((m) => m[1]);
        for (const call of ci.calls(/\$effect(?:\.pre)?/)) {
          const body = ci.slice(call.openParen, call.closeParen, "masked");
          if (!NETWORK.test(body)) continue;
          const s = states.find((v) => new RegExp(`\\b${v}\\s*=(?!=)`).test(body) && (body.match(new RegExp(`\\b${v}\\b`, "g"))?.length ?? 0) > 1);
          if (s) emit(report(ci, file, call.start, s));
        }
      } else if (ci.lang === "vue") {
        for (const call of ci.calls(/(?<![\w.])watch(?:Effect)?/)) {
          const args = ci.args(call);
          const src0 = args[0] ? ci.slice(args[0][0], args[0][1], "masked").trim() : "";
          const body = ci.slice(call.openParen, call.closeParen, "masked");
          const watched = /^[\w$]+$/.test(src0) ? src0 : null;
          if (NETWORK.test(body) && watched && new RegExp(`\\b${watched}\\.value\\s*=(?!=)`).test(body)) emit(report(ci, file, call.start, watched));
        }
      }
    }
  },
);
