/** `gantry check | roast <github-url|path>` and `gantry badge [path]` (lazily loaded so `scan` stays fast). */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeBadge } from "../compilers/badge";
import { buildRepoContext } from "../context/builder";
import { runAudit } from "../engine";
import { color } from "../reporters/pretty";
import { toRoast } from "./card";
import { CheckInputError } from "./fetch";
import { scanTarget } from "./index";
import { renderCheckMarkdown, renderCheckText, renderRoastText } from "./report";
import { toCheck, toRoastInput } from "./summary";

export async function main({ cmd, target, flags }: { cmd: string; target: string; flags: Record<string, string | boolean> }): Promise<number> {
  if (cmd === "badge") {
    const root = resolve(target || ".");
    const report = await runAudit(await buildRepoContext(root, { config: { offline: true } }));
    const res = writeBadge(root, report, { certUrl: typeof flags.cert === "string" ? flags.cert : undefined });
    console.log(
      `${color.green("✔")} ${res.path}${res.verified ? color.green(" (verified)") : color.dim(" (not verified: needs a cert from the official Gantry workflow)")}`,
    );
    console.log(`\nAdd to your README:\n\n${res.snippet}\n`);
    return 0;
  }
  if (!target) {
    console.error(`usage: gantry ${cmd} <https://github.com/owner/repo | path>`);
    return 2;
  }
  let scanned: Awaited<ReturnType<typeof scanTarget>>;
  try {
    scanned = await scanTarget(target);
  } catch (e) {
    if (e instanceof CheckInputError) {
      console.error(color.red(e.message));
      return 2;
    }
    throw e;
  }
  const { report, repo } = scanned;
  if (cmd === "roast") {
    const roast = toRoast(toRoastInput(report, repo), report.generatedAt);
    const out = resolve(typeof flags.out === "string" ? flags.out : "gantry-roast.svg");
    writeFileSync(out, roast.cardSvg);
    if (flags.json) process.stdout.write(`${JSON.stringify(roast, null, 2)}\n`);
    else process.stdout.write(`${renderRoastText(roast)}${color.dim(`card: ${out}`)}\n`);
    return 0;
  }
  const check = toCheck(report, repo);
  if (flags.json) process.stdout.write(`${JSON.stringify(check, null, 2)}\n`);
  else if (flags.md) process.stdout.write(renderCheckMarkdown(check));
  else process.stdout.write(renderCheckText(check));
  return report.blockers > 0 ? 1 : 0;
}
