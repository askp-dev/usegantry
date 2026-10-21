/**
 * Mini-parser for Firebase security rules (`firestore.rules`, `storage.rules`): nested `match` blocks,
 * `allow` statements and zero-arg helper functions, which are inlined so `if isSignedIn()` reads as its body.
 */

export interface RulesAllow {
  /** Full match path, e.g. `/databases/{database}/documents/{document=**}`. */
  path: string;
  methods: string[];
  /** Condition with zero-arg helpers inlined; `true` when the statement has no `if`. */
  condition: string;
  line: number;
  /** Some segment is a recursive wildcard (`{name=**}`). */
  recursive: boolean;
}

/** Blank `//` and `/* *\/` comments, keeping offsets and newlines. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

export function parseFirebaseRules(text: string): RulesAllow[] {
  const s = stripComments(text);
  const lineOf = (pos: number) => s.slice(0, pos).split("\n").length;
  const fns = new Map<string, string>();
  const allows: Array<Omit<RulesAllow, "condition"> & { raw: string }> = [];
  const stack: string[] = [];
  const tok = /\bmatch\s+(\/\S*?)\s*\{(?![\w$])|\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{|\ballow\s+([\w\s,]+?)\s*(?::\s*if\s+([^;]*))?;|[{}]/gy;
  for (let i = 0; i < s.length; ) {
    tok.lastIndex = i;
    const m = tok.exec(s);
    if (!m) {
      i++;
      continue;
    }
    i = tok.lastIndex;
    if (m[1]) stack.push(m[1]);
    else if (m[2]) {
      // skip the function body; keep zero-arg helpers for inlining
      let depth = 1;
      let j = i;
      for (; j < s.length && depth; j++) depth += s[j] === "{" ? 1 : s[j] === "}" ? -1 : 0;
      const ret = s.slice(i, j - 1).match(/\breturn\s+([^;]*);?/)?.[1];
      if (!m[3].trim() && ret) fns.set(m[2], ret.trim());
      i = j;
    } else if (m[4]) {
      const path = stack.filter((p) => p.startsWith("/")).join("");
      allows.push({
        path,
        methods: m[4].split(/[\s,]+/).filter(Boolean),
        raw: (m[5] ?? "true").trim(),
        line: lineOf(m.index),
        recursive: /=\*\*\}/.test(path),
      });
    } else if (m[0] === "{") stack.push("");
    else stack.pop();
  }
  const inline = (c: string, depth = 0): string =>
    depth > 3 ? c : c.replace(/\b(\w+)\s*\(\s*\)/g, (all, n) => (fns.has(n) ? `(${inline(fns.get(n)!, depth + 1)})` : all));
  return allows.map(({ raw, ...a }) => ({ ...a, condition: inline(raw) }));
}

/** Strip whitespace and redundant outer parens: `( request.auth != null )` → `request.auth!=null`. */
export function normalizeCondition(c: string): string {
  let n = c.replace(/\s+/g, "");
  while (/^\((?:[^()]|\([^()]*\))*\)$/.test(n)) n = n.slice(1, -1);
  return n;
}
