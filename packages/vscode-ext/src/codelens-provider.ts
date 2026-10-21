import * as vscode from "vscode";
import type { Finding } from "./scan";

/** One lens per finding, on its line: the rule + title, and a "Fix with AI Agent" action. */
export class FindingCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private byFile = new Map<string, Finding[]>();

  constructor(private readonly root: vscode.Uri) {}

  update(findings: Finding[]) {
    this.byFile = new Map();
    for (const f of findings) {
      const key = vscode.Uri.joinPath(this.root, f.file).fsPath;
      this.byFile.set(key, [...(this.byFile.get(key) ?? []), f]);
    }
    this.changed.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    return (this.byFile.get(doc.uri.fsPath) ?? []).flatMap((f) => {
      const range = doc.lineAt(Math.min(Math.max(f.line - 1, 0), doc.lineCount - 1)).range;
      return [
        new vscode.CodeLens(range, { title: `${f.severity === "CRITICAL" ? "⛔" : "⚠"} ${f.ruleId}: ${f.title}`, command: "" }),
        new vscode.CodeLens(range, { title: "✨ Fix with AI Agent", command: "gantry.fixWithAgent", arguments: [f] }),
      ];
    });
  }
}
