/** Vendor security-questionnaire pack: CycloneDX 1.6 SBOM (+ known advisories) + RoPA data-flow diagram (Mermaid). */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AdvisoryResult, firstFix } from "../context/advisories";
import type { AuditReport, Dependency, RepoContext } from "../context/types";
import { VERSION } from "../engine";
import { requireFeature } from "../entitlements";

const cleanVersion = (v: string) => v.replace(/^[\^~>=<v\s]+/, "").split(/\s/)[0] || "0.0.0";

export function purl(d: Dependency): string {
  const eco = d.ecosystem ?? "npm";
  const name = eco === "npm" ? d.name.replace(/^@/, "%40") : eco === "pypi" ? d.name.toLowerCase() : d.name;
  return `pkg:${eco === "go" ? "golang" : eco}/${name}@${encodeURIComponent(cleanVersion(d.version))}`;
}

const RATING = (s: number) => (s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : s > 0 ? "low" : "none");
const LABEL: Record<string, string> = { CRITICAL: "critical", HIGH: "high", MODERATE: "medium", MEDIUM: "medium", LOW: "low" };

/** CycloneDX 1.6 `vulnerabilities[]` from DEP-01's lookup: one entry per advisory, `affects` every package it hits. */
function sbomVulns(ctx: RepoContext, adv: AdvisoryResult) {
  const byId = new Map<string, any>();
  for (const [key, list] of adv.byKey) {
    const d = ctx.dependencies.get(key);
    if (!d) continue;
    for (const a of list) {
      const v = byId.get(a.id) ?? {
        "bom-ref": `vuln:${a.id}`,
        id: a.id,
        source: { name: "OSV", url: `https://osv.dev/vulnerability/${a.id}` },
        references: a.aliases.map((id) => ({
          id,
          source: {
            name: id.startsWith("CVE-") ? "NVD" : "OSV",
            url: id.startsWith("CVE-") ? `https://nvd.nist.gov/vuln/detail/${id}` : `https://osv.dev/vulnerability/${id}`,
          },
        })),
        ratings: [
          a.cvss !== undefined
            ? { score: a.cvss, severity: RATING(a.cvss), method: "CVSSv3" }
            : { severity: LABEL[a.label ?? ""] ?? "unknown", method: "other" },
        ],
        description: a.summary,
        affects: [],
        properties: [{ name: "gantry:cisa-kev", value: String(a.kev) }],
      };
      const fix = firstFix(d.version, a.fixed);
      v.affects.push({ ref: purl(d) });
      if (fix && !v.recommendation) v.recommendation = `Upgrade ${d.name} to ${fix} or later.`;
      byId.set(a.id, v);
    }
  }
  return [...byId.values()];
}

export function buildSbom(ctx: RepoContext, now = new Date(), advisories?: AdvisoryResult): Record<string, unknown> {
  const deps = [...ctx.dependencies.values()].filter((d) => !d.isLocal);
  const vulns = advisories ? sbomVulns(ctx, advisories) : [];
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: { components: [{ type: "application", name: "gantry", version: VERSION }] },
      component: {
        type: "application",
        name: ctx.packageJson?.name ?? ctx.config.productName,
        version: ctx.packageJson?.version ?? "0.0.0",
        "bom-ref": "root",
      },
    },
    components: deps.map((d) => ({
      type: "library",
      "bom-ref": purl(d),
      name: d.name,
      version: cleanVersion(d.version),
      purl: purl(d),
      scope: d.isDev ? "optional" : "required",
      properties: [{ name: "gantry:dependency", value: d.isDirect ? "direct" : "transitive" }],
      ...(d.spdxLicense ? { licenses: [/\s(OR|AND|WITH)\s/.test(d.spdxLicense) ? { expression: d.spdxLicense } : { license: { id: d.spdxLicense } }] } : {}),
    })),
    // Only direct edges are known (lockfile parents aren't modelled), so the graph is root → direct deps.
    dependencies: [{ ref: "root", dependsOn: [...new Set(deps.filter((d) => d.isDirect).map(purl))] }],
    ...(vulns.length ? { vulnerabilities: vulns } : {}),
    services: ctx.detectedSubprocessors.map((s) => ({
      "bom-ref": `vendor:${s.id}`,
      provider: { name: s.entityName },
      name: s.entityName,
      description: s.category,
      data: s.dataProcessed.map((c) => ({ flow: "outbound", classification: c })),
      externalReferences: [
        ...(s.privacyPolicyUrl ? [{ type: "other", url: s.privacyPolicyUrl, comment: "privacy policy" }] : []),
        ...(s.dpaUrl ? [{ type: "other", url: s.dpaUrl, comment: "DPA" }] : []),
      ],
    })),
  };
}

const mid = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");
const mlabel = (s: string) => s.replace(/"/g, "'");

export function buildDataFlowMermaid(report: AuditReport): string {
  const cols = { entrypoint: "Entrypoints", api: "API & Server Actions", database: "Database", vendor: "Sub-processors" } as const;
  const out = ["flowchart LR"];
  for (const [col, title] of Object.entries(cols)) {
    const ns = report.graph.nodes.filter((n) => n.column === col);
    if (!ns.length) continue;
    out.push(`  subgraph ${col}["${title}"]`);
    for (const n of ns)
      out.push(`    ${mid(n.id)}["${mlabel(n.label)}${n.badges.length ? `<br/><small>${mlabel(n.badges.join(" · "))}</small>` : ""}"]:::${n.status}`);
    out.push("  end");
  }
  for (const e of report.graph.edges) out.push(`  ${mid(e.from)} ${e.dashed ? "-.->" : "-->"} ${mid(e.to)}`);
  out.push(
    "  classDef ok stroke:#10b981,stroke-width:2px",
    "  classDef warn stroke:#f59e0b,stroke-width:2px",
    "  classDef block stroke:#ef4444,stroke-width:3px",
  );
  return `${out.join("\n")}\n`;
}

export function writeVendorPack(ctx: RepoContext, report: AuditReport, outDir = ctx.rootDir): string[] {
  requireFeature("vendorPack");
  const files = [join(outDir, "SBOM.json"), join(outDir, "DATA_FLOW.mermaid")];
  writeFileSync(files[0], `${JSON.stringify(buildSbom(ctx), null, 2)}\n`);
  writeFileSync(files[1], buildDataFlowMermaid(report));
  return files;
}
