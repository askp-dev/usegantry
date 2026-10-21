import { levenshtein } from "../../context/code-index";
import { lookupKnownPackage, topPackages } from "../../context/knowledge";
import type { Dependency } from "../../context/types";
import { defineRule } from "../helpers";

export const REGISTRY_TIMEOUT_MS = 1200;
const DAY = 86_400_000;

type RegistryInfo = { exists: boolean; createdAt?: number; weekly?: number } | null;

/** Live registry check; null = couldn't tell (network error / timeout), never a finding by itself. */
export async function registryInfo(eco: "npm" | "pypi", name: string): Promise<RegistryInfo> {
  const signal = AbortSignal.timeout(REGISTRY_TIMEOUT_MS);
  try {
    if (eco === "npm") {
      const enc = name.replace("/", "%2F");
      const [meta, dl] = await Promise.all([
        fetch(`https://registry.npmjs.org/${enc}`, { signal, headers: { accept: "application/json" } }),
        fetch(`https://api.npmjs.org/downloads/point/last-week/${name}`, { signal }).catch(() => null),
      ]);
      if (meta.status === 404) return { exists: false };
      if (!meta.ok) return null;
      const j: any = await meta.json();
      const weekly = dl?.ok ? ((await dl.json()) as any).downloads : undefined;
      return { exists: true, createdAt: j?.time?.created ? Date.parse(j.time.created) : undefined, weekly };
    }
    const res = await fetch(`https://pypi.org/pypi/${name}/json`, { signal });
    if (res.status === 404) return { exists: false };
    if (!res.ok) return null;
    const j: any = await res.json();
    const uploads = Object.values(j.releases ?? {})
      .flat()
      .map((f: any) => Date.parse(f.upload_time_iso_8601 ?? f.upload_time))
      .filter(Number.isFinite) as number[];
    return { exists: true, createdAt: uploads.length ? Math.min(...uploads) : undefined };
  } catch {
    return null;
  }
}

export function nearestTopPackage(eco: "npm" | "pypi", name: string): string | null {
  if (name.length < 4) return null;
  const n = eco === "pypi" ? name.toLowerCase() : name;
  for (const top of topPackages(eco, 1000)) if (top !== n && levenshtein(n, top, 1) <= 1) return top;
  return null;
}

export const leg01Slopsquatting = defineRule(
  { id: "LEG-01", pillar: "LEGAL", severity: "CRITICAL", title: 'AI-Hallucinated / "Slopsquatted" Dependency Detector' },
  async (ctx, emit) => {
    const report = (d: Dependency, why: string, near?: string) =>
      emit({
        file: d.declaredIn ?? "package.json",
        line: d.declaredLine ?? 1,
        nodeRef: `dep:${d.name}`,
        evidence: `"${d.name}": "${d.version}" (${why})`,
        impact: `\`${d.name}\` ${why}. AI assistants often hallucinate package names, and attackers register them with install-time malware that steals env vars and SSH keys.`,
        agentRemediationPrompt: `Remove \`${d.name}\` from ${d.declaredIn ?? "package.json"}${near ? ` and replace it with the official \`${near}\`` : " and replace it with the verified official SDK for this purpose"}. Update all imports, reinstall, delete the lockfile entry, and audit node_modules/.bin and postinstall scripts if it was ever installed.`,
      });
    const unknown: Dependency[] = [];
    for (const d of ctx.dependencies.values()) {
      if (!d.isDirect || d.isLocal) continue;
      const eco = d.ecosystem ?? "npm";
      const known = lookupKnownPackage(eco, d.name);
      // The seed is a curated top-package list (no repo_url data yet), so membership is the trust signal.
      if (known) continue;
      const near = nearestTopPackage(eco, d.name);
      if (near) report(d, `is 1 edit away from the popular package \`${near}\` (likely typosquat)`, near);
      else unknown.push(d);
    }
    if (ctx.config.offline || !unknown.length) return;
    const infos = await Promise.all(unknown.map((d) => registryInfo(d.ecosystem ?? "npm", d.name)));
    unknown.forEach((d, i) => {
      const info = infos[i];
      if (!info) return;
      if (!info.exists) report(d, "does not exist on the registry (404)");
      else if (info.createdAt && Date.now() - info.createdAt < 30 * DAY && (info.weekly ?? 0) < 500)
        report(d, `was first published ${Math.round((Date.now() - info.createdAt) / DAY)} days ago with ${info.weekly ?? "unknown"} weekly downloads`);
    });
  },
);
