/**
 * `gantry roast`: the shareable 1200×630 "Vibe-Code Survival Card" (SVG only: rasterising text to PNG
 * would need a font engine, i.e. a new dependency).
 * Safety: built only from `RoastInput` (rule ids → canned lines in roast-lines.ts, scores, counts), so no file,
 * route, line, table, secret or evidence string can reach the public card.
 */
import type { Pillar } from "../context/types";
import { ALL_STATIC_RULES } from "../rules/index";
import { CLEAN_LINES, FOOTER, lineFor, PILLAR_LABEL, type RoastPillar, VERDICT } from "./roast-lines";
import { type RoastInput, SCHEMA_VERSION } from "./summary";

const PILLAR_OF = new Map(ALL_STATIC_RULES.map((r) => [r.id, r.pillar]));
const PILLARS: Pillar[] = ["SECURITY", "PRIVACY", "LEGAL", "FINOPS_OPS"];

export interface RoastJson {
  schemaVersion: number;
  mode: "roast";
  repo: { owner: string; name: string };
  score: number;
  verdict: (typeof VERDICT)[keyof typeof VERDICT];
  pillars: Array<{ pillar: RoastPillar; score: number; line: string }>;
  counts: RoastInput["counts"];
  lines: string[];
  cardSvg: string;
  generatedAt: string;
}

/** Up to `max` distinct canned lines for one pillar, worst rule first (`ruleIds` arrive severity-ordered). */
function pillarLines(input: RoastInput, pillar: Pillar, max: number): string[] {
  const out: string[] = [];
  for (const id of input.ruleIds) {
    if (PILLAR_OF.get(id) !== pillar) continue;
    const l = lineFor(id);
    if (l && !out.includes(l)) out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (score: number) => (score >= 90 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444");

export function renderCard(input: RoastInput, verdict: string, perPillar: Array<{ pillar: RoastPillar; score: number; lines: string[] }>): string {
  const accent = input.status === "LAUNCH_READY" ? "#10b981" : input.status === "NEEDS_REVIEW" ? "#f59e0b" : "#ef4444";
  const repo = input.repo.owner ? `${input.repo.owner}/${input.repo.name}` : input.repo.name;
  const repoLabel = repo.length > 40 ? `${repo.slice(0, 39)}…` : repo;
  const rows = perPillar
    .map((p, i) => {
      const y = 140 + i * 100;
      const w = Math.round((p.score / 100) * 666);
      const text = p.lines
        .slice(0, 2)
        .map((l, j) => `<text x="470" y="${y + 46 + j * 22}" class="line">${esc(l)}</text>`)
        .join("");
      return `<text x="470" y="${y}" class="pillar">${p.pillar}</text><text x="1136" y="${y}" class="pscore" text-anchor="end">${p.score}</text>
<rect x="470" y="${y + 14}" width="666" height="10" rx="5" fill="#222634"/><rect x="470" y="${y + 14}" width="${w}" height="10" rx="5" fill="${tone(p.score)}"/>${text}`;
    })
    .join("\n");
  const { critical, high, medium } = input.counts;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Gantry survival card: ${esc(verdict)}, score ${input.score} of 100">
<style>
text{font-family:Inter,-apple-system,"Segoe UI",sans-serif;fill:#f8fafc}
.muted{fill:#94a3b8;font-size:22px}.pillar{font-size:24px;font-weight:600}.pscore{font-size:24px;font-weight:700;fill:#94a3b8}
.line{font-size:18px;fill:#cbd5e1}.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
</style>
<rect width="1200" height="630" fill="#090a0f"/>
<rect x="24" y="24" width="1152" height="582" rx="20" fill="#11131c" stroke="#222634"/>
<rect x="24" y="24" width="1152" height="8" rx="4" fill="${accent}"/>
<text x="64" y="96" font-size="28" font-weight="700">Vibe-Code Survival Card</text>
<text x="64" y="132" class="muted mono">${esc(repoLabel)}</text>
<text x="64" y="330" font-size="150" font-weight="800" fill="${accent}">${input.score}</text>
<text x="64" y="372" class="muted">out of 100</text>
<text x="64" y="436" font-size="38" font-weight="700" fill="${accent}">${esc(verdict)}</text>
<text x="64" y="486" class="muted">${critical} critical · ${high} high · ${medium} medium</text>
${rows}
<text x="64" y="568" class="muted"><tspan font-weight="700" fill="#f8fafc">usegantry.app</tspan>  ·  ${esc(FOOTER)}</text>
</svg>
`;
}

export function toRoast(input: RoastInput, generatedAt: string): RoastJson {
  const verdict = VERDICT[input.status];
  const perPillar = PILLARS.map((p) => {
    const label = PILLAR_LABEL[p];
    const found = pillarLines(input, p, 3);
    return { pillar: label, score: input.pillars.find((x) => x.pillar === p)?.score ?? 100, lines: found.length ? found : [CLEAN_LINES[label]] };
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "roast",
    repo: input.repo,
    score: input.score,
    verdict,
    pillars: perPillar.map((p) => ({ pillar: p.pillar, score: p.score, line: p.lines[0] })),
    counts: input.counts,
    lines: perPillar.flatMap((p) => p.lines),
    cardSvg: renderCard(input, verdict, perPillar),
    generatedAt,
  };
}
