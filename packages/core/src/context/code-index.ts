/**
 * Zero-dependency structural code index.
 *
 * Produces three position-preserving views of a source file:
 *   - `text`        original source
 *   - `noComments`  comments blanked with spaces (newlines preserved)
 *   - `masked`      comments AND string/template/regex literal contents blanked
 *
 * Because every view has identical length and line structure, an offset found in one view
 * maps 1:1 to the others. Rules pattern-match on `masked` (so code inside strings/comments
 * never produces matches), then read literal values from `noComments` / `text`.
 *
 * On top of the views it provides bracket matching, function extraction (declarations,
 * arrows, methods, Python defs), call-site discovery, object-literal key parsing and import
 * extraction — the subset of AST queries the Preflight rule-set needs, at lexer speed.
 */

export type Lang = "js" | "py" | "svelte" | "vue" | "html" | "sql" | "other";

export interface FnInfo {
  name: string | null;
  kind: "declaration" | "arrow" | "method" | "python";
  start: number; // start of the declaration (incl. `export`)
  paramsStart: number; // index of "(" (or param identifier for bare arrows)
  paramsEnd: number; // index of ")" (inclusive)
  bodyStart: number; // index of "{" (or first char of expression body / python body)
  bodyEnd: number; // index of matching "}" (or end of expression / python block)
  exported: boolean;
  isDefaultExport: boolean;
  isAsync: boolean;
  wrapper?: string; // e.g. withAuth in `export const POST = withAuth(async () => {})`
  decorators?: string[]; // python
  line: number;
  expressionBody: boolean;
}

export interface CallSite {
  callee: string;
  start: number; // start of callee match
  openParen: number;
  closeParen: number;
  line: number;
}

export interface ObjectEntry {
  key: string;
  shorthand: boolean;
  spread: boolean;
  start: number;
  end: number; // exclusive
  valueStart: number;
  valueEnd: number; // exclusive
}

export interface ImportInfo {
  source: string;
  names: string[];
  defaultName?: string;
  namespace?: string;
  line: number;
  typeOnly: boolean;
}

const OPEN = new Set(["(", "[", "{"]);
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const PAIR: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", ";", "+", "-", "*", "%", "~", "^"]);
const REGEX_PREV_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);
const NOT_METHOD_NAMES = new Set([
  "if", "for", "while", "switch", "catch", "function", "return", "with", "else", "do", "try", "typeof", "new", "await", "yield", "super", "import", "export", "constructor_",
]);

export function detectLang(relPath: string): Lang {
  const p = relPath.toLowerCase();
  if (/\.(m|c)?(t|j)sx?$/.test(p)) return "js";
  if (p.endsWith(".py")) return "py";
  if (p.endsWith(".svelte")) return "svelte";
  if (p.endsWith(".vue")) return "vue";
  if (p.endsWith(".html") || p.endsWith(".htm")) return "html";
  if (p.endsWith(".sql")) return "sql";
  return "other";
}

/** Blank chars [a,b) in buf with spaces, keeping newlines. */
function blank(buf: string[], a: number, b: number) {
  for (let k = a; k < b; k++) if (buf[k] !== "\n" && buf[k] !== "\r") buf[k] = " ";
}

/** Lex a JS/TS region [from,to) of `src`, writing into nc (noComments) & mk (masked) buffers. */
function lexJs(src: string, nc: string[], mk: string[], from: number, to: number) {
  let i = from;
  // stack of template-literal brace depths
  const tplStack: number[] = [];
  let braceDepth = 0;
  let lastSig = ""; // last significant char in masked output
  let lastWord = "";

  const startTemplate = (startIdx: number): number => {
    // startIdx points at the backtick (or at the '}' that resumes template). Returns index after template end or at "${".
    let j = startIdx + 1;
    while (j < to) {
      const c = src[j];
      if (c === "\\") {
        blank(mk, j, Math.min(j + 2, to));
        j += 2;
        continue;
      }
      if (c === "`") {
        return j + 1; // template closed
      }
      if (c === "$" && src[j + 1] === "{") {
        tplStack.push(braceDepth);
        braceDepth++;
        return -(j + 2); // negative => entered expression at j+2
      }
      if (c !== "\n" && c !== "\r") mk[j] = " ";
      j++;
    }
    return to;
  };

  while (i < to) {
    const c = src[i];
    const n = src[i + 1];
    // comments
    if (c === "/" && n === "/") {
      let j = i;
      while (j < to && src[j] !== "\n") j++;
      blank(nc, i, j);
      blank(mk, i, j);
      i = j;
      continue;
    }
    if (c === "/" && n === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 || j >= to ? to : j + 2;
      blank(nc, i, j);
      blank(mk, i, j);
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < to) {
        const d = src[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === c) {
          closed = true;
          break;
        }
        if (d === "\n") break; // unterminated (likely JSX text apostrophe) -> stop at EOL
        j++;
      }
      if (closed) {
        blank(mk, i + 1, j);
        i = j + 1;
        lastSig = c;
        lastWord = "";
      } else {
        // JSX text like Don't — treat quote as a plain char
        i++;
      }
      continue;
    }
    if (c === "`") {
      const r = startTemplate(i);
      lastSig = "`";
      lastWord = "";
      if (r < 0) {
        i = -r;
        continue;
      }
      i = r;
      continue;
    }
    if (c === "/") {
      const isRegexCtx = lastSig === "" || REGEX_PREV.has(lastSig) || REGEX_PREV_WORDS.has(lastWord);
      if (isRegexCtx) {
        let j = i + 1;
        let inClass = false;
        let ok = false;
        while (j < to) {
          const d = src[j];
          if (d === "\\") {
            j += 2;
            continue;
          }
          if (d === "\n") break;
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) {
            ok = true;
            break;
          }
          j++;
        }
        if (ok && j > i + 1) {
          blank(mk, i + 1, j);
          i = j + 1;
          while (i < to && /[a-z]/i.test(src[i])) i++;
          lastSig = "/";
          lastWord = "";
          continue;
        }
      }
      lastSig = "/";
      lastWord = "";
      i++;
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") {
      if (tplStack.length && tplStack[tplStack.length - 1] === braceDepth - 1) {
        tplStack.pop();
        braceDepth--;
        // resume template literal after "}"
        const r = startTemplate(i);
        if (r < 0) {
          i = -r;
          continue;
        }
        i = r;
        lastSig = "`";
        continue;
      }
      braceDepth--;
    }
    if (/[A-Za-z_$0-9]/.test(c)) {
      let j = i;
      while (j < to && /[A-Za-z_$0-9]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      lastSig = "a";
      i = j;
      continue;
    }
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
      lastSig = c;
      lastWord = "";
    }
    i++;
  }
}

function lexPy(src: string, nc: string[], mk: string[], from: number, to: number) {
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === "#") {
      let j = i;
      while (j < to && src[j] !== "\n") j++;
      blank(nc, i, j);
      blank(mk, i, j);
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      let closed = false;
      while (j < to) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src.startsWith(q, j)) {
          closed = true;
          break;
        }
        if (!triple && src[j] === "\n") break;
        j++;
      }
      if (closed) {
        blank(mk, i + q.length, j);
        i = j + q.length;
      } else i++;
      continue;
    }
    i++;
  }
}

/** Blank HTML comments in markup regions (both views). */
function lexMarkup(src: string, nc: string[], mk: string[], from: number, to: number) {
  let i = src.indexOf("<!--", from);
  while (i !== -1 && i < to) {
    let j = src.indexOf("-->", i + 4);
    j = j === -1 || j > to ? to : j + 3;
    blank(nc, i, j);
    blank(mk, i, j);
    i = src.indexOf("<!--", j);
  }
}

export class CodeIndex {
  readonly text: string;
  readonly noComments: string;
  readonly masked: string;
  readonly lang: Lang;
  readonly path: string;
  /** For svelte/vue/html: [start,end) offsets of <script> bodies */
  readonly scriptRanges: Array<[number, number]>;
  private lineStarts: number[];
  private _functions?: FnInfo[];
  private _imports?: ImportInfo[];

  constructor(text: string, relPath: string, lang: Lang = detectLang(relPath)) {
    this.text = text;
    this.path = relPath;
    this.lang = lang;
    const nc = text.split("");
    const mk = text.split("");
    this.scriptRanges = [];
    if (lang === "js") lexJs(text, nc, mk, 0, text.length);
    else if (lang === "py") lexPy(text, nc, mk, 0, text.length);
    else if (lang === "svelte" || lang === "vue" || lang === "html") {
      const re = /<script\b[^>]*>/gi;
      let m: RegExpExecArray | null;
      let cursor = 0;
      while ((m = re.exec(text))) {
        const s = m.index + m[0].length;
        const e = text.indexOf("</script>", s);
        const end = e === -1 ? text.length : e;
        lexMarkup(text, nc, mk, cursor, m.index);
        lexJs(text, nc, mk, s, end);
        this.scriptRanges.push([s, end]);
        cursor = end;
        re.lastIndex = end;
      }
      lexMarkup(text, nc, mk, cursor, text.length);
    }
    this.noComments = nc.join("");
    this.masked = mk.join("");
    this.lineStarts = [0];
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) this.lineStarts.push(k + 1);
  }

  /** 1-indexed line of offset */
  lineOf(pos: number): number {
    let lo = 0,
      hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }
  lineStart(line: number): number {
    return this.lineStarts[Math.max(0, Math.min(line - 1, this.lineStarts.length - 1))];
  }
  lineEnd(line: number): number {
    const next = this.lineStarts[line];
    return next === undefined ? this.text.length : next - 1;
  }
  get lineCount() {
    return this.lineStarts.length;
  }
  lineText(line: number): string {
    return this.text.slice(this.lineStart(line), this.lineEnd(line));
  }
  /** Multi-line snippet around an offset or line (trimmed of shared indentation). */
  snippet(posOrLine: number, opts: { before?: number; after?: number; isLine?: boolean } = {}): string {
    const line = opts.isLine ? posOrLine : this.lineOf(posOrLine);
    const a = Math.max(1, line - (opts.before ?? 0));
    const b = Math.min(this.lineCount, line + (opts.after ?? 2));
    const lines: string[] = [];
    for (let l = a; l <= b; l++) lines.push(this.lineText(l));
    const indent = Math.min(...lines.filter((x) => x.trim()).map((x) => x.match(/^\s*/)![0].length));
    return lines
      .map((x) => x.slice(Number.isFinite(indent) ? indent : 0))
      .join("\n")
      .trimEnd();
  }
  slice(a: number, b: number, view: "text" | "masked" | "noComments" = "text") {
    return this[view].slice(a, b);
  }

  /** Index of the bracket matching the one at `openPos` (in masked view), or -1. */
  matchClose(openPos: number): number {
    const s = this.masked;
    const open = s[openPos];
    if (!OPEN.has(open)) return -1;
    const stack: string[] = [];
    for (let k = openPos; k < s.length; k++) {
      const c = s[k];
      if (OPEN.has(c)) stack.push(c);
      else if (c in CLOSE) {
        if (stack[stack.length - 1] !== CLOSE[c]) {
          // mismatched — tolerate by popping until match
          const idx = stack.lastIndexOf(CLOSE[c]);
          if (idx === -1) continue;
          stack.length = idx + 1;
        }
        stack.pop();
        if (stack.length === 0) return k;
      }
    }
    return -1;
  }
  /** Index of the bracket opening the one at `closePos`, or -1. */
  matchOpen(closePos: number): number {
    const s = this.masked;
    const close = s[closePos];
    if (!(close in CLOSE)) return -1;
    let depth = 0;
    for (let k = closePos; k >= 0; k--) {
      const c = s[k];
      if (c in CLOSE) depth++;
      else if (OPEN.has(c)) {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  /** Next non-whitespace index at or after pos in masked view. */
  skipWs(pos: number): number {
    const s = this.masked;
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    return pos;
  }
  skipWsBack(pos: number): number {
    const s = this.masked;
    while (pos >= 0 && /\s/.test(s[pos])) pos--;
    return pos;
  }

  /** Regex search over a view. Returns matches with .index. Regex must be global. */
  findAll(re: RegExp, view: "masked" | "noComments" | "text" = "masked", from = 0, to?: number): RegExpExecArray[] {
    const src = this[view];
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    const r = new RegExp(re.source, flags);
    r.lastIndex = from;
    const out: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    const end = to ?? src.length;
    while ((m = r.exec(src))) {
      if (m.index >= end) break;
      out.push(m);
      if (m[0].length === 0) r.lastIndex++;
    }
    return out;
  }
  test(re: RegExp, view: "masked" | "noComments" | "text" = "masked", from = 0, to?: number): boolean {
    return this.findAll(re, view, from, to).length > 0;
  }
  /** Position of first regex match within [from,to), or -1 */
  indexOf(re: RegExp, from = 0, to?: number, view: "masked" | "noComments" | "text" = "masked"): number {
    const m = this.findAll(re, view, from, to)[0];
    return m ? m.index : -1;
  }

  /**
   * Call sites whose callee matches `calleeRe` (applied to masked text, must match up to just
   * before the "(" — optional whitespace allowed). E.g. /\bprisma\.\w+\.update/.
   */
  calls(calleeRe: RegExp, from = 0, to?: number): CallSite[] {
    const src = new RegExp(`(?:${calleeRe.source})\\s*(?:<[^>()]*>)?\\s*\\(`, calleeRe.flags.replace("g", "") + "g");
    const out: CallSite[] = [];
    for (const m of this.findAll(src, "masked", from, to)) {
      const open = m.index + m[0].length - 1;
      const close = this.matchClose(open);
      if (close === -1) continue;
      const callee = this.masked.slice(m.index, open).replace(/\s*(<[^>()]*>)?\s*$/, "").trim();
      out.push({ callee, start: m.index, openParen: open, closeParen: close, line: this.lineOf(m.index) });
    }
    return out;
  }

  /** Split [start,end) at top-level commas. Returns [a,b) ranges (trimmed). */
  splitTopLevel(start: number, end: number, sep = ","): Array<[number, number]> {
    const s = this.masked;
    const out: Array<[number, number]> = [];
    let depth = 0;
    let angle = 0;
    let segStart = start;
    for (let k = start; k < end; k++) {
      const c = s[k];
      if (OPEN.has(c)) depth++;
      else if (c in CLOSE) depth--;
      else if (c === sep && depth === 0 && angle <= 0) {
        out.push(this.trimRange(segStart, k));
        segStart = k + 1;
      }
    }
    const last = this.trimRange(segStart, end);
    if (last[1] > last[0]) out.push(last);
    return out.filter(([a, b]) => b > a);
  }
  trimRange(a: number, b: number): [number, number] {
    const s = this.masked;
    while (a < b && /\s/.test(s[a])) a++;
    while (b > a && /\s/.test(s[b - 1])) b--;
    return [a, b];
  }
  /** Argument ranges of a call site. */
  args(call: CallSite): Array<[number, number]> {
    return this.splitTopLevel(call.openParen + 1, call.closeParen);
  }

  /** Parse the top-level entries of an object literal whose "{" is at `openBrace`. */
  objectEntries(openBrace: number): ObjectEntry[] {
    if (this.masked[openBrace] !== "{") return [];
    const close = this.matchClose(openBrace);
    if (close === -1) return [];
    const out: ObjectEntry[] = [];
    for (const [a, b] of this.splitTopLevel(openBrace + 1, close)) {
      const raw = this.noComments.slice(a, b);
      if (raw.startsWith("...")) {
        out.push({ key: raw.slice(3).trim(), shorthand: false, spread: true, start: a, end: b, valueStart: a + 3, valueEnd: b });
        continue;
      }
      // key: quoted, identifier, computed, or method
      const km = raw.match(/^(?:async\s+)?(?:(["'])([^"']*)\1|\[([^\]]*)\]|([A-Za-z_$][\w$]*))\s*(:|\(|$)?/);
      if (!km) continue;
      const key = km[2] ?? km[3] ?? km[4] ?? "";
      const after = km[5];
      if (after === ":") {
        const colon = a + km[0].length;
        const vs = this.skipWs(colon);
        out.push({ key, shorthand: false, spread: false, start: a, end: b, valueStart: vs, valueEnd: b });
      } else if (after === "(") {
        out.push({ key, shorthand: false, spread: false, start: a, end: b, valueStart: a, valueEnd: b });
      } else {
        out.push({ key, shorthand: true, spread: false, start: a, end: b, valueStart: a, valueEnd: b });
      }
    }
    return out;
  }

  /** Identifiers in [a,b) (masked view — skips strings/comments). */
  identifiers(a: number, b: number): string[] {
    return this.masked.slice(a, b).match(/[A-Za-z_$][\w$]*/g) ?? [];
  }

  /** Does the file start with a directive like "use server" / "use client"? */
  hasTopDirective(directive: string): boolean {
    const head = this.noComments.slice(0, 400).trimStart();
    return new RegExp(`^(['"])${directive}\\1`).test(head);
  }
  /** Does the body starting at a "{" begin with the directive? */
  bodyHasDirective(bodyStart: number, directive: string): boolean {
    const seg = this.noComments.slice(bodyStart + 1, bodyStart + 200).trimStart();
    return new RegExp(`^(['"])${directive}\\1`).test(seg);
  }

  /** Extract all functions (JS/TS or Python). Memoized. */
  functions(): FnInfo[] {
    if (this._functions) return this._functions;
    this._functions = this.lang === "py" ? this.pyFunctions() : this.jsFunctions();
    return this._functions;
  }

  /** Innermost function whose body contains pos. */
  enclosingFunction(pos: number): FnInfo | undefined {
    let best: FnInfo | undefined;
    for (const f of this.functions()) {
      if (pos >= f.bodyStart && pos <= f.bodyEnd) {
        if (!best || f.bodyStart >= best.bodyStart) best = f;
      }
    }
    return best;
  }
  /** Outermost exported (or named top-level) function containing pos. */
  outerFunction(pos: number): FnInfo | undefined {
    let best: FnInfo | undefined;
    for (const f of this.functions()) {
      if (pos >= f.bodyStart && pos <= f.bodyEnd) {
        if (!best || f.bodyStart < best.bodyStart) best = f;
      }
    }
    return best;
  }

  private exportedNames(): { names: Set<string>; defaultName?: string } {
    const names = new Set<string>();
    let defaultName: string | undefined;
    for (const m of this.findAll(/\bexport\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const p = part.trim().split(/\s+as\s+/);
        if (p[0]) names.add(p[0].trim());
        if (p[1]?.trim() === "default") defaultName = p[0].trim();
      }
    }
    const d = this.masked.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*(\n|$)/);
    if (d && !["function", "async", "class"].includes(d[1])) defaultName = d[1];
    if (defaultName) names.add(defaultName);
    return { names, defaultName };
  }

  private bodyAfterParams(paramsEnd: number): number {
    // Skip optional return type annotation; find "{" at angle/paren depth 0.
    const s = this.masked;
    let k = this.skipWs(paramsEnd + 1);
    if (s[k] === "{") return k;
    if (s[k] !== ":") return -1;
    let angle = 0;
    let paren = 0;
    for (k = k + 1; k < s.length && k < paramsEnd + 400; k++) {
      const c = s[k];
      if (c === "<") angle++;
      else if (c === ">" && s[k - 1] !== "=") angle--;
      else if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (c === "{" && angle <= 0 && paren <= 0) {
        // object type literal directly after ":"? e.g. `): { ok: boolean } {` — peek for a following "{"
        const prev = this.skipWsBack(k - 1);
        if (s[prev] === ":" || s[prev] === "|" || s[prev] === "&") {
          const c2 = this.matchClose(k);
          if (c2 === -1) return -1;
          k = c2;
          continue;
        }
        return k;
      } else if ((c === ";" || c === "=") && angle <= 0 && paren <= 0) {
        if (c === "=" && s[k + 1] === ">") return -1;
        return -1;
      }
    }
    return -1;
  }

  private jsFunctions(): FnInfo[] {
    const s = this.masked;
    const out: FnInfo[] = [];
    const exp = this.exportedNames();
    const ranges: Array<[number, number]> = this.lang === "js" ? [[0, s.length]] : this.scriptRanges;
    const seenBody = new Set<number>();

    for (const [rs, re] of ranges) {
      // 1) function declarations / expressions
      for (const m of this.findAll(/\b(export\s+(?:default\s+)?)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>()]*>)?\s*\(/g, "masked", rs, re)) {
        const open = m.index + m[0].length - 1;
        const close = this.matchClose(open);
        if (close === -1) continue;
        const body = this.bodyAfterParams(close);
        if (body === -1) continue;
        const end = this.matchClose(body);
        if (end === -1) continue;
        let name = m[3] ?? null;
        const exportPrefix = m[1] ?? "";
        let exported = !!exportPrefix || (name ? exp.names.has(name) : false);
        let isDefault = /default/.test(exportPrefix) || (!!name && exp.defaultName === name);
        // `export const POST = async function () {}` / `const x = function() {}`
        if (!name || !exportPrefix) {
          const before = s.slice(Math.max(rs, m.index - 160), m.index);
          const am = before.match(/(?:(export)\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:([\w$.]+)\s*\(\s*)?$/);
          if (am) {
            name = name ?? am[2];
            if (am[1] || exp.names.has(am[2])) exported = true;
            if (exp.defaultName === am[2]) isDefault = true;
          }
        }
        seenBody.add(body);
        out.push({
          name,
          kind: "declaration",
          start: m.index,
          paramsStart: open,
          paramsEnd: close,
          bodyStart: body,
          bodyEnd: end,
          exported,
          isDefaultExport: isDefault,
          isAsync: !!m[2],
          line: this.lineOf(m.index),
          expressionBody: false,
        });
      }

      // 2) arrow functions
      for (const m of this.findAll(/=>/g, "masked", rs, re)) {
        const arrow = m.index;
        let pEnd = this.skipWsBack(arrow - 1);
        let pStart: number;
        // optional return type: `(x): Promise<Y> =>` — walk back over ": Type"
        if (s[pEnd] !== ")" && !/[\w$]/.test(s[pEnd])) continue;
        if (s[pEnd] === ")") {
          pStart = this.matchOpen(pEnd);
          if (pStart === -1) continue;
        } else {
          // identifier param or return type annotation ending in identifier/">"
          let k = pEnd;
          while (k >= 0 && /[\w$]/.test(s[k])) k--;
          const ident = s.slice(k + 1, pEnd + 1);
          const prevC = this.skipWsBack(k);
          // detect `): Type =>` annotations
          const colonAnn = s.lastIndexOf(":", pEnd);
          const closeBeforeColon = colonAnn > 0 ? this.skipWsBack(colonAnn - 1) : -1;
          if (colonAnn > prevC - 1 && closeBeforeColon >= 0 && s[closeBeforeColon] === ")" && colonAnn > arrow - 120 && s.slice(colonAnn, arrow).indexOf("\n") === -1) {
            pEnd = closeBeforeColon;
            pStart = this.matchOpen(pEnd);
            if (pStart === -1) continue;
          } else {
            if (!ident || /^\d/.test(ident)) continue;
            pStart = k + 1;
            pEnd = pStart + ident.length - 1;
          }
        }
        let bStart = this.skipWs(arrow + 2);
        let bEnd: number;
        let exprBody = false;
        if (s[bStart] === "{") {
          bEnd = this.matchClose(bStart);
          if (bEnd === -1) continue;
        } else {
          exprBody = true;
          // expression body: until top-level , ) ; } or blank line
          let depth = 0;
          let k = bStart;
          for (; k < re; k++) {
            const c = s[k];
            if (OPEN.has(c)) depth++;
            else if (c in CLOSE) {
              if (depth === 0) break;
              depth--;
            } else if ((c === "," || c === ";") && depth === 0) break;
            else if (c === "\n" && depth === 0) {
              const nxt = this.skipWs(k);
              if (!/[.?:+\-*/|&]/.test(s[nxt] ?? "")) break;
            }
          }
          bEnd = k - 1;
        }
        if (seenBody.has(bStart)) continue;
        seenBody.add(bStart);
        // async?
        const beforeParams = s.slice(Math.max(rs, pStart - 200), pStart);
        const isAsync = /\basync\s*$/.test(beforeParams);
        const bp = beforeParams.replace(/\basync\s*$/, "");
        let name: string | null = null;
        let exported = false;
        let isDefault = false;
        let wrapper: string | undefined;
        let start = pStart;
        const am = bp.match(/(?:(export)\s+(default\s+)?)?(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*)?(?:([\w$.]+)\s*(?:<[^>()]*>)?\s*\(\s*)?(?:[\w$]+\s*,\s*)?$/);
        if (am && (am[3] || am[1])) {
          name = am[3] ?? null;
          exported = !!am[1] || (name ? exp.names.has(name) : false);
          isDefault = !!am[2] || (!!name && exp.defaultName === name);
          wrapper = am[4];
          start = Math.max(rs, pStart - 200) + (am.index ?? 0);
        } else {
          // object property:  `key: async (x) => {}`  or `key(…)`
          const pm = bp.match(/(?:^|[\s,{])(["']?)([A-Za-z_$][\w$-]*)\1\s*:\s*$/);
          if (pm) name = pm[2];
          else {
            const wm = bp.match(/([\w$.]+)\s*\(\s*$/);
            if (wm) wrapper = wm[1];
          }
        }
        out.push({
          name,
          kind: "arrow",
          start: Math.max(rs, start),
          paramsStart: pStart,
          paramsEnd: pEnd,
          bodyStart: bStart,
          bodyEnd: bEnd,
          exported,
          isDefaultExport: isDefault,
          isAsync,
          wrapper,
          line: this.lineOf(pStart),
          expressionBody: exprBody,
        });
      }

      // 3) methods / object shorthand: `async name(args) {`  `name(args) {`
      for (const m of this.findAll(/(?:^|[\s,{;}])((?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?)([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/g, "masked", rs, re)) {
        const name = m[2];
        if (NOT_METHOD_NAMES.has(name) || name === "function") continue;
        const open = m.index + m[0].length - 1;
        const nameStart = m.index + m[0].lastIndexOf(name);
        const modStart = nameStart - (m[1]?.length ?? 0);
        const prevIdx = this.skipWsBack(modStart - 1);
        const prev = prevIdx >= 0 ? s[prevIdx] : "";
        const lineHead = s.slice(s.lastIndexOf("\n", modStart - 1) + 1, modStart);
        const atLineStart = lineHead.trim() === "";
        if (!(prev === "" || prev === "{" || prev === "," || prev === ";" || prev === "}" || atLineStart)) continue;
        if (prev === "." ) continue;
        const close = this.matchClose(open);
        if (close === -1) continue;
        const body = this.bodyAfterParams(close);
        if (body === -1 || seenBody.has(body)) continue;
        const end = this.matchClose(body);
        if (end === -1) continue;
        seenBody.add(body);
        out.push({
          name,
          kind: "method",
          start: m.index + (m[0].length - m[0].trimStart().length),
          paramsStart: open,
          paramsEnd: close,
          bodyStart: body,
          bodyEnd: end,
          exported: false,
          isDefaultExport: false,
          isAsync: /async/.test(m[1] ?? ""),
          line: this.lineOf(open),
          expressionBody: false,
        });
      }
    }
    return out.sort((a, b) => a.bodyStart - b.bodyStart);
  }

  private pyFunctions(): FnInfo[] {
    const out: FnInfo[] = [];
    const s = this.masked;
    for (const m of this.findAll(/^([ \t]*)(async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/gm)) {
      const indent = m[1].length;
      const open = m.index + m[0].length - 1;
      const close = this.matchClose(open);
      if (close === -1) continue;
      const colon = s.indexOf(":", s.slice(close).search(/\)\s*(->[^:]*)?:/) + close);
      const bodyStart = colon + 1;
      // body = following lines with indent > def indent
      let k = s.indexOf("\n", bodyStart);
      let bodyEnd = s.length - 1;
      if (k !== -1) {
        const firstLineRest = s.slice(bodyStart, k).trim();
        if (firstLineRest) bodyEnd = k - 1; // one-liner
        else {
          bodyEnd = k;
          let lineStart = k + 1;
          while (lineStart < s.length) {
            const le = s.indexOf("\n", lineStart);
            const line = s.slice(lineStart, le === -1 ? s.length : le);
            if (line.trim() !== "") {
              const ind = line.match(/^[ \t]*/)![0].length;
              if (ind <= indent) break;
              bodyEnd = le === -1 ? s.length - 1 : le - 1;
            }
            if (le === -1) break;
            lineStart = le + 1;
          }
        }
      }
      // decorators above
      const decorators: string[] = [];
      let l = this.lineOf(m.index) - 1;
      while (l >= 1) {
        const t = this.noComments.slice(this.lineStart(l), this.lineEnd(l)).trim();
        if (t.startsWith("@")) {
          decorators.unshift(t);
          l--;
        } else if (t === "" || t.startsWith(")") || /^[\w"'=,\s.()\[\]-]+[,)]?$/.test(t) && decorators.length === 0 && false) l--;
        else break;
      }
      out.push({
        name: m[3],
        kind: "python",
        start: m.index + indent,
        paramsStart: open,
        paramsEnd: close,
        bodyStart,
        bodyEnd,
        exported: indent === 0,
        isDefaultExport: false,
        isAsync: !!m[2],
        decorators,
        line: this.lineOf(m.index),
        expressionBody: false,
      });
    }
    return out;
  }

  imports(): ImportInfo[] {
    if (this._imports) return this._imports;
    const out: ImportInfo[] = [];
    const nc = this.noComments;
    if (this.lang === "py") {
      for (const m of this.findAll(/^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm, "noComments"))
        for (const src of m[1].split(",")) out.push({ source: src.trim(), names: [], line: this.lineOf(m.index), typeOnly: false });
      for (const m of this.findAll(/^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+\(?([\w\s,]+)/gm, "noComments"))
        out.push({ source: m[1], names: m[2].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean), line: this.lineOf(m.index), typeOnly: false });
    } else {
      for (const m of this.findAll(/\bimport\s+(type\s+)?([\w$*{},\s]+?)\s+from\s+(['"])([^'"]+)\3/g, "noComments")) {
        const clause = m[2];
        const names: string[] = [];
        let defaultName: string | undefined;
        let namespace: string | undefined;
        const braces = clause.match(/\{([^}]*)\}/);
        if (braces) for (const p of braces[1].split(",")) {
          const nm = p.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
          if (nm[0]) names.push(nm[nm.length - 1].trim());
        }
        const ns = clause.match(/\*\s+as\s+([\w$]+)/);
        if (ns) namespace = ns[1];
        const def = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[\w$]+/, "").split(",")[0].trim();
        if (def) defaultName = def;
        out.push({ source: m[4], names, defaultName, namespace, line: this.lineOf(m.index), typeOnly: !!m[1] });
      }
      for (const m of this.findAll(/\bimport\s+(['"])([^'"]+)\1/g, "noComments")) out.push({ source: m[2], names: [], line: this.lineOf(m.index), typeOnly: false });
      for (const m of this.findAll(/\b(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g, "noComments")) {
        const before = nc.slice(Math.max(0, m.index - 80), m.index);
        const dm = before.match(/(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*(?:await\s+)?$/);
        const names: string[] = [];
        let defaultName: string | undefined;
        if (dm) {
          if (dm[1].startsWith("{")) names.push(...dm[1].slice(1, -1).split(",").map((x) => x.trim().split(":").pop()!.trim()).filter(Boolean));
          else defaultName = dm[1];
        }
        out.push({ source: m[2], names, defaultName, line: this.lineOf(m.index), typeOnly: false });
      }
    }
    this._imports = out;
    return out;
  }

  /** Does the file import from a module matching `re`? */
  importsFrom(re: RegExp): ImportInfo[] {
    return this.imports().filter((i) => re.test(i.source) && !i.typeOnly);
  }

  /** String literal value starting at `pos` (pointing at the quote) in noComments view. */
  stringAt(pos: number): string | null {
    const q = this.noComments[pos];
    if (q !== "'" && q !== '"' && q !== "`") return null;
    const end = this.noComments.indexOf(q, pos + 1);
    if (end === -1) return null;
    return this.noComments.slice(pos + 1, end);
  }
}

/** Shared tiny helpers */
/** Optimal-string-alignment (Damerau–Levenshtein) distance, early-exit above `max`. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length,
    m = b.length;
  let prev2 = new Array(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[m];
}

export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}
