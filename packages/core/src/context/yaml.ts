/**
 * Hand-rolled YAML subset reader (zero deps) for docker-compose files.
 * Supports block maps/sequences, `- key: v` items, plain/quoted scalars, flow `[a, b]` / `{a: b}`,
 * comments, `|`/`>` block scalars, anchors/aliases and `<<` merges. First document only.
 * Every node keeps its 1-indexed source line so rules can emit exact `autoFixPatch` ranges.
 */
export type YNode = { line: number; value: string | YNode[] | YMap };
export type YMap = { [key: string]: YNode };

type Line = { n: number; indent: number; text: string };

export function parseYaml(src: string): YNode | null {
  const lines: Line[] = [];
  const raw = src.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (/^(?:---|\.\.\.)\s*(?:#.*)?$/.test(r)) {
      if (lines.length) break;
      continue;
    }
    const text = stripComment(r).trimEnd();
    if (!text.trim()) continue;
    // block scalar: swallow the more-indented lines that follow
    const indent = text.length - text.trimStart().length;
    if (/:\s*[|>][-+]?\d*$|^\s*-\s*[|>][-+]?\d*$/.test(text)) {
      const body: string[] = [];
      while (i + 1 < raw.length && (!raw[i + 1].trim() || raw[i + 1].length - raw[i + 1].trimStart().length > indent)) body.push(raw[++i].trim());
      lines.push({ n: i - body.length + 1, indent, text: text.trimStart().replace(/[|>][-+]?\d*$/, JSON.stringify(body.join("\n").trim())) });
      continue;
    }
    lines.push({ n: i + 1, indent, text: text.trimStart() });
  }
  const anchors = new Map<string, YNode>();
  let pos = 0;

  function block(indent: number): YNode | null {
    const first = lines[pos];
    if (!first || first.indent < indent) return null;
    return first.text.startsWith("- ") || first.text === "-" ? seq(first.indent) : map(first.indent);
  }

  function seq(indent: number): YNode {
    const items: YNode[] = [];
    const line = lines[pos].n;
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text.startsWith("- ") || lines[pos].text === "-")) {
      const l = lines[pos];
      const rest = l.text.slice(1).trimStart();
      if (!rest) {
        pos++;
        items.push(block(indent + 1) ?? { line: l.n, value: "" });
      } else if (isMapEntry(rest)) {
        // `- key: v` → a map whose first entry sits on the dash line; re-enter it as an indented line
        lines[pos] = { n: l.n, indent: indent + (l.text.length - rest.length), text: rest };
        items.push(map(lines[pos].indent));
      } else {
        pos++;
        items.push(scalarOrFlow(rest, l.n));
      }
    }
    return { line, value: items };
  }

  function map(indent: number): YNode {
    const out: YMap = {};
    const line = lines[pos].n;
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith("- ")) {
      const l = lines[pos];
      const m = splitEntry(l.text);
      if (!m) {
        pos++;
        continue;
      }
      const [key, rest] = m;
      pos++;
      let node: YNode;
      const anchor = rest.match(/^&([\w-]+)\s*(.*)$/);
      const body = anchor ? anchor[2] : rest;
      if (!body) {
        const next = lines[pos];
        // a sequence may sit at the same indent as its parent key
        node =
          next && (next.indent > indent || (next.indent === indent && next.text.startsWith("- ")))
            ? (block(next.indent) ?? { line: l.n, value: "" })
            : { line: l.n, value: "" };
      } else node = scalarOrFlow(body, l.n);
      if (anchor) anchors.set(anchor[1], node);
      if (key === "<<") {
        for (const src of Array.isArray(node.value) ? node.value : [node])
          if (isMap(src)) for (const [k, v] of Object.entries(src.value)) if (!(k in out)) out[k] = v;
      } else out[key] = node;
    }
    return { line, value: out };
  }

  function scalarOrFlow(s: string, line: number): YNode {
    s = s.trim();
    if (s.startsWith("*")) return anchors.get(s.slice(1)) ?? { line, value: "" };
    if (s.startsWith("[") || s.startsWith("{")) return flow(s, line);
    return { line, value: unquote(s) };
  }

  return lines.length ? block(lines[0].indent) : null;
}

export const isMap = (n: YNode | null | undefined): n is { line: number; value: YMap } => !!n && typeof n.value === "object" && !Array.isArray(n.value);
export const isSeq = (n: YNode | undefined): n is { line: number; value: YNode[] } => !!n && Array.isArray(n.value);
export const str = (n: YNode | undefined): string | undefined => (n && typeof n.value === "string" ? n.value : undefined);

function flow(s: string, line: number): YNode {
  const close = s[0] === "[" ? "]" : "}";
  const inner = s.slice(1, s.lastIndexOf(close));
  const parts: string[] = [];
  let depth = 0;
  let q = "";
  let cur = "";
  for (const ch of inner) {
    if (q) q = ch === q ? "" : q;
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === "," && !depth) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  if (close === "]") return { line, value: parts.map((p) => (/^\s*[[{]/.test(p) ? flow(p.trim(), line) : { line, value: unquote(p.trim()) })) };
  const out: YMap = {};
  for (const p of parts) {
    const m = splitEntry(p.trim());
    if (m) out[m[0]] = /^[[{]/.test(m[1]) ? flow(m[1], line) : { line, value: unquote(m[1]) };
  }
  return { line, value: out };
}

/** `key: rest` (key may be quoted). Returns null for non-entries. */
function splitEntry(t: string): [string, string] | null {
  const m = t.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#][^:]*?)\s*:(?:\s+(.*)|$)/);
  return m ? [unquote(m[1]), (m[2] ?? "").trim()] : null;
}
const isMapEntry = (t: string) => splitEntry(t) !== null;

function unquote(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s.endsWith('"')) return s.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ n: "\n", t: "\t" })[c as "n"] ?? c);
  if (s.length >= 2 && s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

/** Drop a trailing `# comment` that isn't inside quotes. */
function stripComment(l: string): string {
  let q = "";
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) q = c === q ? "" : q;
    else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(l[i - 1]))) return l.slice(0, i);
  }
  return l;
}
