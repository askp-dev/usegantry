import type { AuditReport, LegalManifest } from "./types";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { status: res.status });
  return data as T;
}

export interface LegalPreview {
  manifest: LegalManifest;
  applied: boolean;
  changes: Array<{ path: string; diff: string }>;
  disclaimer: string;
}

export const getReport = () => call<{ report: AuditReport; mermaid: string }>("/api/report");
export const legalPreview = () => call<LegalPreview>("/api/legal/preview", {});
export const legalApply = () => call<LegalPreview>("/api/legal/apply", {});
export const exportCert = (allowBlocked = false) => call<{ files: string[]; url: string; blocked: boolean }>("/api/cert/export", { allowBlocked });

export const copyText = (text: string) => navigator.clipboard?.writeText(text);
