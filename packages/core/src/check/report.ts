/** `gantry check` renderers: plain-language terminal output and `--md` (for a PR comment). Roast's short terminal text too. */
import { color } from "../reporters/pretty";
import type { RoastJson } from "./card";
import { CATEGORY_LABEL, type CheckJson } from "./summary";

const repoLabel = (j: { repo: { owner: string; name: string } }) => (j.repo.owner ? `${j.repo.owner}/${j.repo.name}` : j.repo.name);

export function renderCheckText(j: CheckJson): string {
  const tint = j.status === "LAUNCH_READY" ? color.green : j.status === "LAUNCH_BLOCKED" ? color.red : color.amber;
  const out = ["", `${color.bold("Gantry check")}  ${repoLabel(j)}${j.repo.sha ? color.dim(` @ ${j.repo.sha.slice(0, 7)}`) : ""}`, ""];
  out.push(`${tint(color.bold(`${j.score}/100`))}  ${j.headline}`, "");
  if (j.topFixes.length) out.push(color.bold("Top fixes"));
  j.topFixes.forEach((f, i) => {
    out.push(
      `${i + 1}. ${f.plainWhy}`,
      `   ${color.dim(`${CATEGORY_LABEL[f.category]} · ${f.ruleId} · ${f.file}:${f.line}`)}`,
      `   ${color.indigo("Paste into your AI agent:")} ${f.agentPrompt}`,
      "",
    );
  });
  out.push(j.categories.map((c) => `${c.label}: ${c.count}`).join(" · "));
  for (const n of j.notices) out.push(color.dim(n));
  out.push(color.dim("Full details: gantry scan --verbose"), "");
  return out.join("\n");
}

export function renderCheckMarkdown(j: CheckJson): string {
  const icon = j.status === "LAUNCH_READY" ? "🟢" : j.status === "LAUNCH_BLOCKED" ? "🔴" : "🟠";
  const md = (s: string) => s.replace(/([\\`*_[\]<>|])/g, "\\$1");
  const out = [`### ${icon} Gantry: ${j.score}/100`, "", md(j.headline), ""];
  if (j.topFixes.length) {
    out.push("| # | What's wrong | Where | Priority |", "|---|---|---|---|");
    for (const [i, f] of j.topFixes.entries())
      out.push(`| ${i + 1} | ${md(f.plainWhy)} | \`${f.file.replace(/`/g, "")}:${f.line}\` | ${CATEGORY_LABEL[f.category]} |`);
    out.push("", "<details><summary>Prompts for your AI agent</summary>", "");
    for (const [i, f] of j.topFixes.entries()) out.push(`${i + 1}. **${f.ruleId}**: ${md(f.agentPrompt)}`);
    out.push("", "</details>", "");
  }
  out.push(j.categories.map((c) => `${c.label}: **${c.count}**`).join(" · "), "", `<sub>${j.notices.map(md).join(" ")}</sub>`, "");
  return out.join("\n");
}

export function renderRoastText(j: RoastJson): string {
  const tint = j.verdict === "Survives launch" ? color.green : j.verdict === "Shaky" ? color.amber : color.red;
  const out = ["", `${color.bold("Gantry roast")}  ${repoLabel(j)}`, "", `${tint(color.bold(`${j.score}/100 · ${j.verdict}`))}`, ""];
  for (const p of j.pillars) out.push(`${p.pillar.padEnd(9)} ${String(p.score).padStart(3)}  ${p.line}`);
  out.push("", color.dim("usegantry.app · run `gantry check` for the fixes"), "");
  return out.join("\n");
}
