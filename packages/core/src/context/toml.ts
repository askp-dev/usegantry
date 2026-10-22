/**
 * Hand-rolled TOML subset reader (zero deps) for agent configs (`.codex/config.toml`).
 * Supports `[table]` / `[[array-of-tables]]` headers, dotted and quoted keys, basic / literal / multi-line strings,
 * numbers, booleans, (multi-line) arrays, inline tables and `#` comments. Dates are kept as raw strings.
 * Returns null on anything it can't parse, so callers skip the file instead of guessing.
 */
type TomlTable = Record<string, unknown>;

const isTable = (v: unknown): v is TomlTable => !!v && typeof v === "object" && !Array.isArray(v);

export function parseToml(src: string): TomlTable | null {
  let i = 0;
  const fail = (): never => {
    throw new Error("toml");
  };
  const ws = () => {
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
  };
  /** Whitespace, newlines and comments (inside arrays). */
  const wsnl = () => {
    for (;;) {
      ws();
      if (src[i] === "#") while (i < src.length && src[i] !== "\n") i++;
      else if (src[i] === "\n" || src[i] === "\r") i++;
      else return;
    }
  };
  const endOfLine = () => {
    ws();
    if (src[i] === "#") while (i < src.length && src[i] !== "\n") i++;
    if (i < src.length && src[i] !== "\n" && src[i] !== "\r") fail();
  };
  const ESC: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
  const basic = (multi: boolean): string => {
    let out = "";
    for (;;) {
      if (i >= src.length) fail();
      if (multi ? src.startsWith('"""', i) && src[i + 3] !== '"' : src[i] === '"') {
        i += multi ? 3 : 1;
        return out;
      }
      const c = src[i++];
      if (!multi && c === "\n") fail();
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = src[i++];
      if (e in ESC) out += ESC[e];
      else if (e === "u" || e === "U") {
        const n = e === "u" ? 4 : 8;
        out += String.fromCodePoint(Number.parseInt(src.slice(i, i + n), 16) || 0xfffd);
        i += n;
      } else if (multi && /[ \t\r\n]/.test(e)) while (/[ \t\r\n]/.test(src[i] ?? "")) i++;
      else fail();
    }
  };
  const str = (): string => {
    if (src.startsWith('"""', i)) {
      i += 3;
      if (src[i] === "\n") i++;
      else if (src.startsWith("\r\n", i)) i += 2;
      return basic(true);
    }
    if (src.startsWith("'''", i)) {
      i += 3;
      if (src[i] === "\n") i++;
      const end = src.indexOf("'''", i);
      if (end < 0) fail();
      const s = src.slice(i, end);
      i = end + 3;
      return s;
    }
    if (src[i] === '"') {
      i++;
      return basic(false);
    }
    if (src[i] === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0 || src.slice(i + 1, end).includes("\n")) fail();
      const s = src.slice(i + 1, end);
      i = end + 1;
      return s;
    }
    return fail();
  };
  const key = (): string[] => {
    const parts: string[] = [];
    for (;;) {
      ws();
      if (src[i] === '"' || src[i] === "'") parts.push(str());
      else {
        const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i, i + 256));
        if (!m) fail();
        parts.push(m![0]);
        i += m![0].length;
      }
      ws();
      if (src[i] !== ".") return parts;
      i++;
    }
  };
  /** Walk/create nested tables along `path` (array-of-tables resolve to their last element). */
  const descend = (root: TomlTable, path: string[]): TomlTable => {
    let t = root;
    for (const k of path) {
      let next = t[k];
      if (next === undefined) next = t[k] = {};
      if (Array.isArray(next)) next = next[next.length - 1];
      if (!isTable(next)) fail();
      t = next as TomlTable;
    }
    return t;
  };
  const assign = (table: TomlTable, path: string[], v: unknown) => {
    const t = descend(table, path.slice(0, -1));
    const last = path[path.length - 1];
    if (last in t) fail();
    t[last] = v;
  };
  const value = (): unknown => {
    const c = src[i];
    if (c === '"' || c === "'") return str();
    if (c === "[") {
      i++;
      const arr: unknown[] = [];
      for (;;) {
        wsnl();
        if (src[i] === "]") {
          i++;
          return arr;
        }
        arr.push(value());
        wsnl();
        if (src[i] === ",") i++;
        else if (src[i] !== "]") fail();
      }
    }
    if (c === "{") {
      i++;
      const t: TomlTable = {};
      ws();
      if (src[i] === "}") {
        i++;
        return t;
      }
      for (;;) {
        const k = key();
        if (src[i++] !== "=") fail();
        ws();
        assign(t, k, value());
        ws();
        if (src[i] === "}") {
          i++;
          return t;
        }
        if (src[i++] !== ",") fail();
      }
    }
    const m = /^[^\s,\]}#]+/.exec(src.slice(i, i + 256));
    if (!m) fail();
    const raw = m![0];
    i += raw.length;
    if (raw === "true" || raw === "false") return raw === "true";
    const n = Number(raw.replace(/_/g, ""));
    return Number.isNaN(n) || !/^[+-]?(\d|inf|nan|0x|0o|0b)/.test(raw) ? raw : n;
  };

  const root: TomlTable = {};
  let cur = root;
  try {
    for (;;) {
      wsnl();
      if (i >= src.length) return root;
      if (src[i] === "[") {
        const array = src[i + 1] === "[";
        i += array ? 2 : 1;
        const path = key();
        if (src[i] !== "]" || (array && src[i + 1] !== "]")) fail();
        i += array ? 2 : 1;
        endOfLine();
        if (array) {
          const parent = descend(root, path.slice(0, -1));
          const last = path[path.length - 1];
          parent[last] ??= [];
          const list = parent[last];
          if (!Array.isArray(list)) fail();
          cur = {};
          (list as unknown[]).push(cur);
        } else cur = descend(root, path);
        continue;
      }
      const k = key();
      if (src[i++] !== "=") fail();
      ws();
      assign(cur, k, value());
      endOfLine();
    }
  } catch {
    return null;
  }
}
