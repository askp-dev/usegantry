import { existsSync, readFileSync } from "node:fs";
import * as vscode from "vscode";
import type { AuditReport } from "./scan";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sidebar webview: the compiled Svelte UI when bundled (media/ui), otherwise a small inline findings list. */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private report?: AuditReport;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    const uiRoot = vscode.Uri.joinPath(this.extensionUri, "media", "ui");
    view.webview.options = { enableScripts: true, localResourceRoots: [uiRoot] };
    view.webview.onDidReceiveMessage((m: { type?: string }) => {
      if (m?.type === "ready") this.post();
    });
    this.render(uiRoot);
  }

  update(report: AuditReport) {
    this.report = report;
    if (!this.view) return;
    if (this.view.webview.html.includes('data-gantry="inline"')) this.render(vscode.Uri.joinPath(this.extensionUri, "media", "ui"));
    else this.post();
  }

  private post() {
    if (this.report) this.view?.webview.postMessage({ type: "report", report: this.report });
  }

  private render(uiRoot: vscode.Uri) {
    if (!this.view) return;
    const { webview } = this.view;
    const index = vscode.Uri.joinPath(uiRoot, "index.html").fsPath;
    const csp = `default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};`;
    if (existsSync(index)) {
      const assets = webview.asWebviewUri(uiRoot).toString();
      webview.html = readFileSync(index, "utf8")
        .replace(/(src|href)="\.\//g, `$1="${assets}/`)
        .replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
      return;
    }
    const r = this.report;
    const rows = (r?.findings ?? [])
      .map((f) => `<li><b>${esc(f.severity)}</b> <code>${esc(f.ruleId)}</code> ${esc(f.title)}<br><small>${esc(f.file)}:${esc(f.line)}</small></li>`)
      .join("");
    webview.html = `<!doctype html><html data-gantry="inline"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground)}li{margin:6px 0}code{font-family:var(--vscode-editor-font-family)}</style></head>
<body><h3>${r ? `${esc(r.status.replace("_", " "))} • ${esc(r.score)}/100` : "Scanning…"}</h3><ul>${rows}</ul></body></html>`;
  }
}
