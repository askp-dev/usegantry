/** Vendor security-questionnaire pack: CycloneDX 1.5 SBOM + RoPA data-flow diagram (Mermaid). */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditReport, Dependency, RepoContext } from "../context/types";
import { VERSION } from "../engine";
import { requireFeature } from "../entitlements";

const cleanVersion = (v: string) => v.replace(/^[\^~>=<v\s]+/, "").split(/\s/)[0] || "0.0.0";

export function purl(d: Dependency): string {
  const eco = d.ecosystem ?? "npm";
  const name = eco === "npm" ? d.name.replace(/^@/, "%40") : eco === "pypi" ? d.name.toLowerCase() : d.name;
  return `pkg:${eco === "go" ? "golang" : eco}/${name}@${encodeURIComponent(cleanVersion(d.version))}`;
}

export function buildSbom(ctx: RepoContext, now = new Date()): Record<string, unknown> {
  const deps = [...ctx.dependencies.values()].filter((d) => !d.isLocal);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: { components: [{ type: "application", name: "preflight", version: VERSION }] },
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
      ...(d.spdxLicense ? { licenses: [/\s(OR|AND|WITH)\s/.test(d.spdxLicense) ? { expression: d.spdxLicense } : { license: { id: d.spdxLicense } }] } : {}),
    })),
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
