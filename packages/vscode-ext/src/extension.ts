import * as vscode from "vscode";
import { requireFeature } from "../../core/src/entitlements";
import { FindingCodeLensProvider } from "./codelens-provider";
import { type AuditReport, type Finding, runScan } from "./scan";
import { SidebarProvider } from "./sidebar-provider";

const SEVERITY: Record<Finding["severity"], vscode.DiagnosticSeverity> = {
  CRITICAL: vscode.DiagnosticSeverity.Error,
  HIGH: vscode.DiagnosticSeverity.Warning,
  MEDIUM: vscode.DiagnosticSeverity.Information,
};
const SAVE_DEBOUNCE_MS = 1500;

function toDiagnostic(f: Finding): vscode.Diagnostic {
  const line = Math.max(f.line - 1, 0);
  const d = new vscode.Diagnostic(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER), `${f.title}: ${f.impact}`, SEVERITY[f.severity]);
  d.code = f.ruleId;
  d.source = "Gantry";
  return d;
}

export function activate(context: vscode.ExtensionContext) {
  requireFeature("ide");
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const config = () => vscode.workspace.getConfiguration("gantry");
  const diagnostics = vscode.languages.createDiagnosticCollection("gantry");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const lenses = new FindingCodeLensProvider(folder.uri);
  const sidebar = new SidebarProvider(context.extensionUri);
  status.command = "workbench.view.extension.gantry";
  status.text = "$(shield) Gantry";
  status.show();

  let scanning: Promise<void> | null = null;
  async function scan() {
    if (scanning) return scanning;
    status.text = "$(sync~spin) Gantry";
    scanning = runScan(config().get<string[]>("command") ?? ["gantry"], folder!.uri.fsPath)
      .then((report) => apply(report))
      .catch((e: Error) => {
        status.text = "$(warning) Gantry";
        status.tooltip = e.message;
      })
      .finally(() => {
        scanning = null;
      });
    return scanning;
  }

  function apply(report: AuditReport) {
    diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const f of report.findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), toDiagnostic(f)]);
    for (const [file, ds] of byFile) diagnostics.set(vscode.Uri.joinPath(folder!.uri, file), ds);
    lenses.update(report.findings);
    sidebar.update(report);
    const blocked = report.status === "LAUNCH_BLOCKED";
    status.text = `$(${blocked ? "error" : report.status === "LAUNCH_READY" ? "pass" : "warning"}) ${report.score}/100`;
    status.tooltip = `${report.status.replace("_", " ")} · ${report.blockers} blocker(s) · ${report.findings.length} finding(s)`;
    status.backgroundColor = blocked ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
  }

  async function fixWithAgent(f?: Finding) {
    if (!f) return;
    const prompt = `[${f.ruleId}] ${f.file}:${f.line}\n${f.agentRemediationPrompt}`;
    await vscode.env.clipboard.writeText(prompt);
    const available = new Set(await vscode.commands.getCommands(true));
    const cmd = (config().get<string[]>("agentCommands") ?? []).find((c) => available.has(c));
    if (cmd) await vscode.commands.executeCommand(cmd, prompt).then(undefined, () => undefined);
    vscode.window.showInformationMessage(`Gantry: fix prompt for ${f.ruleId} copied${cmd ? " and sent to your agent" : ". Paste it into your AI agent"}.`);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    diagnostics,
    status,
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, lenses),
    vscode.window.registerWebviewViewProvider("gantry.sidebar", sidebar),
    vscode.commands.registerCommand("gantry.scan", scan),
    vscode.commands.registerCommand("gantry.fixWithAgent", fixWithAgent),
    vscode.commands.registerCommand("gantry.openMissionControl", () => vscode.commands.executeCommand("workbench.view.extension.gantry")),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!config().get<boolean>("scanOnSave", true) || !doc.uri.fsPath.startsWith(folder.uri.fsPath)) return;
      clearTimeout(timer);
      timer = setTimeout(scan, SAVE_DEBOUNCE_MS);
    }),
    { dispose: () => clearTimeout(timer) },
  );
  scan();
}

export function deactivate() {}
