import { defineRule } from "../helpers";

const COPYLEFT = /\b(AGPL|GPL|SSPL|Commons[- ]Clause|CC-BY-NC|CC-BY-NC-SA|CC-BY-NC-ND|EUPL|OSL|RPL)\b/i;

/** SPDX expression is acceptable if any `OR` alternative contains no copyleft term (AND = all apply). */
export function isCopyleft(spdx: string): boolean {
  const options = spdx.replace(/[()]/g, " ").split(/\s+OR\s+|\s*\/\s*|\s*,\s*/i);
  return options.every((opt) => COPYLEFT.test(opt));
}

export const leg02CopyleftEula = defineRule(
  { id: "LEG-02", pillar: "LEGAL", severity: "CRITICAL", title: "Viral Copyleft License Conflict with Commercial EULA" },
  (ctx, emit) => {
    if (ctx.config.mode !== "commercial") return;
    for (const d of ctx.dependencies.values()) {
      if (d.isDev || d.isLocal || !d.spdxLicense || !isCopyleft(d.spdxLicense)) continue;
      emit({
        file: d.declaredIn ?? "package.json",
        line: d.declaredLine ?? 1,
        nodeRef: `dep:${d.name}`,
        evidence: `${d.name}@${d.version}: ${d.spdxLicense}${d.isDirect ? "" : " (transitive)"}`,
        impact: `\`${d.name}\` is licensed ${d.spdxLicense}. Shipping it in a closed-source commercial product can oblige you to release your source code (AGPL/SSPL even for network use), or block commercial use outright.`,
        agentRemediationPrompt: `Replace \`${d.name}\` with a permissively licensed (MIT / Apache-2.0 / BSD / ISC) alternative${d.isDirect ? "" : ` by upgrading or replacing the direct dependency that pulls it in (run \`npm ls ${d.name}\`)`}, or move it to devDependencies if it's build-time only. If it must stay, get a commercial license or set \`"gantry": { "mode": "open-source" }\`.`,
      });
    }
  },
);
