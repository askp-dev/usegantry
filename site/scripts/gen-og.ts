// Builds static/og.png (1200×630 social preview) from the real before/after scan in src/lib/data.
// macOS only: renders the HTML with WebKit via scripts/snapshot.swift. Run `bun run data` first, then `bun run og`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import meta from "../src/lib/data/meta.json";
import sample from "../src/lib/data/sample.json";

type Pillar = { pillar: string; critical: number; high: number };
const STATION: Record<string, string> = { SECURITY: "Security", PRIVACY: "Privacy", LEGAL: "Legal", FINOPS_OPS: "Cost" };
// DESIGN.md §5.2, same as callOf() in src/lib/site.ts.
const callOf = (p: Pillar) => (p.critical > 0 ? "NO-GO" : p.high > 0 ? "HOLD" : "GO");
const tag = (c: string) => `<span class="call ${c === "NO-GO" ? "nogo" : c.toLowerCase()}">${c}</span>`;

const after = new Map((sample.after.pillars as Pillar[]).map((p) => [p.pillar, p]));
const rows = (sample.before.pillars as Pillar[])
  .map((p) => `<tr><th>${STATION[p.pillar]}</th><td>${tag(callOf(p))}</td><td>${tag(callOf(after.get(p.pillar) ?? p))}</td></tr>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112..125,700..800&family=Martian+Mono:wght@400;500&family=Public+Sans:wght@400;600&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;background:#f1eee6;color:#17181b;font-family:"Public Sans",sans-serif;overflow:hidden}
.frame{position:absolute;inset:24px;border:1.5px solid #17181b;display:grid;grid-template-columns:1fr 452px;grid-template-rows:1fr 76px}
.left{padding:40px 40px 0}
.brand{display:flex;align-items:center;gap:14px;font-family:Archivo;font-weight:800;font-stretch:125%;font-size:26px;letter-spacing:.08em}
h1{font-family:Archivo;font-weight:800;font-stretch:112%;font-size:62px;line-height:1.02;letter-spacing:-.01em;margin-top:44px}
.sub{font-size:24px;line-height:1.35;color:#4a4c52;margin-top:24px;max-width:560px}
.right{border-left:1px solid #c9c3b4;padding:40px 36px 0}
.label{font-family:Archivo;font-weight:700;font-stretch:125%;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6c70}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-top:1px solid #c9c3b4;padding:14px 0;text-align:left}
tr:last-child th,tr:last-child td{border-bottom:1px solid #c9c3b4}
th{font-weight:600;font-size:22px}
td{width:118px}
thead th{font-family:Archivo;font-weight:700;font-stretch:125%;font-size:12px;letter-spacing:.14em;color:#6b6c70;padding:0 0 10px;border-top:0}
.call{display:inline-block;width:104px;padding:7px 0;text-align:center;font-family:Archivo;font-weight:800;font-stretch:125%;font-size:16px;letter-spacing:.06em}
.nogo{background:#b8231e;color:#f1eee6}.hold{background:#b87c00;color:#17181b}.go{background:#1d6b45;color:#f1eee6}
.note{font-size:16px;color:#4a4c52;margin-top:14px}
.block{grid-column:1/-1;border-top:1.5px solid #17181b;display:grid;grid-template-columns:auto 1fr auto auto}
.block>div{padding:0 24px;display:flex;flex-direction:column;justify-content:center;gap:4px;border-left:1px solid #c9c3b4}
.block>div:first-child{border-left:0}
.mono{font-family:"Martian Mono",monospace;font-size:18px}
.mono b{font-weight:500}
</style></head><body><div class="frame">
<div class="left">
<div class="brand"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke-linecap="square"><path d="M6 3v18M13 3v18M3 21h13M13 9h8v3M5 3h9" stroke="#17181b" stroke-width="2"/><path d="M6 7l7 3-7 3 7 3-7 3" stroke="#17181b" stroke-width="1.5"/><rect x="3" y="22" width="13" height="2" fill="#ff4f00"/></svg>GANTRY</div>
<h1>Is your AI-built app ready to launch?</h1>
<p class="sub">${meta.ruleCount} launch checks in 0.3 s. Plain-English fixes, each with a prompt your coding agent can run.</p>
</div>
<div class="right">
<div class="label">Go / No-go board · sample repo</div>
<table><thead><tr><th>STATION</th><th>BEFORE</th><th>AFTER</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">${sample.before.blockers} blockers before fixes, ${sample.after.blockers} after. Real scan output.</p>
</div>
<div class="block">
<div><span class="label">Site</span><span class="mono"><b>usegantry.app</b></span></div>
<div><span class="label">Run</span><span class="mono">bunx @usegantry/cli check &lt;repo&gt;</span></div>
<div><span class="label">Licence</span><span class="mono">Free · MIT</span></div>
<div><span class="label">Sheet</span><span class="mono">1/1</span></div>
</div>
</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "gantry-og-"));
const page = join(dir, "og.html");
writeFileSync(page, html);
const out = join(import.meta.dir, "../static/og.png");
const r = spawnSync("swift", [join(import.meta.dir, "snapshot.swift"), page, out, "1200", "630"], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`og image: ${out}`);
