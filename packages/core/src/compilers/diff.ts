/** Minimal unified diff (LCS over lines, 3 lines of context) for /api/legal/preview and `legal` dry-runs. */
export function unifiedDiff(a: string, b: string, file: string, context = 3): string {
  if (a === b) return "";
  const x = a === "" ? [] : a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  // LCS table (docs are small; O(n·m) is fine)
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Array<{ t: " " | "-" | "+"; s: string; ai: number; bi: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) ops.push({ t: " ", s: x[i], ai: i++, bi: j++ });
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) ops.push({ t: "-", s: x[i], ai: i++, bi: j });
    else ops.push({ t: "+", s: y[j], ai: i, bi: j++ });
  }
  const out = [`--- a/${file}`, `+++ b/${file}`];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].t === " ") {
      k++;
      continue;
    }
    let start = Math.max(0, k - context);
    let end = k;
    // extend hunk while changes are within 2*context of each other
    while (end < ops.length) {
      if (ops[end].t !== " ") {
        end++;
        continue;
      }
      let run = 0;
      while (end + run < ops.length && ops[end + run].t === " ") run++;
      if (end + run >= ops.length || run > context * 2) {
        end = Math.min(ops.length, end + context);
        break;
      }
      end += run;
    }
    const hunk = ops.slice(start, end);
    const aLen = hunk.filter((o) => o.t !== "+").length;
    const bLen = hunk.filter((o) => o.t !== "-").length;
    out.push(`@@ -${hunk[0].ai + (aLen ? 1 : 0)},${aLen} +${hunk[0].bi + (bLen ? 1 : 0)},${bLen} @@`);
    for (const o of hunk) out.push(o.t + o.s);
    k = end;
    start = end;
  }
  return `${out.join("\n")}\n`;
}
