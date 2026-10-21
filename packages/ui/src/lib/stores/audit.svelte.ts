import { getReport } from "../api";
import type { AuditReport, Finding } from "../types";

/** Inside the VS Code webview the extension posts the report in; in the browser we fetch it. */
declare const acquireVsCodeApi: undefined | (() => { postMessage(msg: unknown): void });
export const inVsCode = typeof acquireVsCodeApi === "function";

export const audit = $state({
  report: null as AuditReport | null,
  loading: false,
  error: "",
  nodeFilter: null as string | null,
});

export async function refresh() {
  if (inVsCode) return;
  audit.loading = true;
  audit.error = "";
  try {
    audit.report = (await getReport()).report;
  } catch (e) {
    audit.error = e instanceof Error ? e.message : String(e);
  } finally {
    audit.loading = false;
  }
}

if (inVsCode) {
  window.addEventListener("message", (e: MessageEvent<{ type: string; report?: AuditReport }>) => {
    if (e.data?.type === "report" && e.data.report) audit.report = e.data.report;
  });
  acquireVsCodeApi?.().postMessage({ type: "ready" });
}

/** Findings attached to a graph node: by explicit nodeRef, or by the rule IDs the node carries. */
export function findingsFor(nodeId: string | null): Finding[] {
  const r = audit.report;
  if (!r) return [];
  const node = nodeId ? r.graph.nodes.find((n) => n.id === nodeId) : undefined;
  return node ? r.findings.filter((f) => f.nodeRef === node.id || node.ruleIds.includes(f.ruleId)) : r.findings;
}

export function fixAllPrompt(r: AuditReport): string {
  const ordered = [...r.findings.filter((f) => f.blocking), ...r.findings.filter((f) => !f.blocking)];
  return ordered.map((f, i) => `${i + 1}. [${f.ruleId}] ${f.file}:${f.line}\n${f.agentRemediationPrompt}`).join("\n\n");
}
