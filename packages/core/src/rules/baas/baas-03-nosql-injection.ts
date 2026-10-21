import { defineRule, refersTo, taintedVars, USER_INPUT_RE, VALIDATION_RE } from "../helpers";

const MONGO_DEPS = ["mongoose", "mongodb", "@typegoose/typegoose", "mongoist", "monk"];
const MONGO_CALL =
  /(?<![\w$])[\w$.]+(?:\.collection\s*\([^)]*\))?\.(?:find|findOne|findOneAndUpdate|findOneAndDelete|findOneAndReplace|updateOne|updateMany|replaceOne|deleteOne|deleteMany|countDocuments)/;
/** App-wide operator stripping: `express-mongo-sanitize`, `mongoose.set("sanitizeFilter", true)`. */
const GLOBAL_SANITIZER = /\bmongoSanitize\s*\(|sanitizeFilter['"]?\s*[,:]\s*true/;
/** A value coerced to a scalar or run through a sanitizer can't carry `$ne` / `$gt` / `$where`. */
const SAFE_VALUE =
  /^(?:String|Number|Boolean|parseInt|parseFloat|new\s+ObjectId|ObjectId|new\s+Types\.ObjectId|sanitize|mongoSanitize|escape)\s*\(|\.(?:toString|trim)\s*\(\s*\)$|\$eq\s*:/;

export const baas03NosqlInjection = defineRule(
  { id: "BAAS-03", pillar: "SECURITY", severity: "HIGH", title: "MongoDB Operator Injection From Unvalidated Request Input" },
  (ctx, emit) => {
    if (!MONGO_DEPS.some((d) => ctx.dependencies.has(d))) return;
    const files = ctx.files.all.filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(f));
    if (files.some((f) => GLOBAL_SANITIZER.test(ctx.getText(f)))) return;
    for (const file of files) {
      if (!USER_INPUT_RE.test(ctx.getText(file))) continue;
      const ci = ctx.getCode(file);
      const scopes = new Map<number, { tainted: Set<string>; parsed: Set<string> }>();
      const scopeAt = (pos: number) => {
        const fn = ci.outerFunction(pos) ?? ci.enclosingFunction(pos);
        const [a, b] = [fn?.bodyStart ?? 0, fn?.bodyEnd ?? ci.text.length];
        if (!scopes.has(a)) {
          // `const input = schema.parse(req.body)`: `input.email` is validated, though USER_INPUT_RE reads `input.*` as tRPC input
          const parsed = new Set(
            [...ci.slice(a, b, "noComments").matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*([^;\n]+)/g)]
              .filter((m) => VALIDATION_RE.test(m[2]))
              .map((m) => m[1]),
          );
          scopes.set(a, { tainted: taintedVars(ci, a, b), parsed });
        }
        return scopes.get(a)!;
      };
      const raw = (e: string, pos: number) => {
        const { tainted, parsed } = scopeAt(pos);
        return !SAFE_VALUE.test(e) && !VALIDATION_RE.test(e) && !parsed.has(e.match(/^[\w$]+/)?.[0] ?? "") && (USER_INPUT_RE.test(e) || refersTo(e, tainted));
      };
      for (const call of ci.calls(MONGO_CALL)) {
        if (/\b(?:prisma|supabase|drizzle|knex|sequelize)\b/.test(call.callee)) continue;
        const args = ci.args(call).slice(0, 2);
        // `arr.find((x) => …)` is Array.prototype.find, not a query
        if (args[0] && /=>|^\s*(?:async\s+)?function\b/.test(ci.slice(args[0][0], args[0][1], "masked"))) continue;
        let hit: string | undefined;
        for (const [a, b] of args) {
          if (ci.masked[a] !== "{") {
            const e = ci.slice(a, b, "noComments").trim();
            if (raw(e, call.start)) hit = e;
          } else
            for (const en of ci.objectEntries(a)) {
              const e = en.spread
                ? ci.slice(en.start, en.end, "noComments").trim()
                : en.shorthand
                  ? en.key
                  : ci.slice(en.valueStart, en.valueEnd, "noComments").trim();
              if (raw(e.replace(/^\.\.\./, ""), call.start)) hit = e;
              if (hit) break;
            }
          if (hit) break;
        }
        if (!hit) continue;
        const method = call.callee.split(".").pop();
        emit({
          file,
          line: call.line,
          evidence: ci.snippet(call.start, { after: 0 }),
          impact: `\`${hit.slice(0, 60)}\` comes straight from the request into a Mongo \`${method}\` filter. A JSON body like \`{"password": {"$ne": null}}\` or \`{"$where": "…"}\` turns an equality check into an operator, which bypasses logins, matches every document, or ${/update|delete|replace/i.test(method ?? "") ? "rewrites/deletes other users' records" : "leaks other users' records"}.`,
          agentRemediationPrompt: `In ${file}:${call.line}, parse the input with an allowlisted schema first (e.g. \`const { email } = z.object({ email: z.string().email() }).parse(await req.json())\`) and build the filter from those scalars (\`{ email: String(email) }\`). Also enable \`mongoose.set("sanitizeFilter", true)\` or \`express-mongo-sanitize\` app-wide.`,
        });
      }
    }
  },
);
