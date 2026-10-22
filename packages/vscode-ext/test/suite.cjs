// Runs inside the Extension Development Host (VS Code or a fork): activate → scan → diagnostics, CodeLens, agent commands.
const vscode = require("vscode");
const { writeFileSync } = require("node:fs");

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

const save = (obj) => process.env.GANTRY_EDH_OUT && writeFileSync(process.env.GANTRY_EDH_OUT, `${JSON.stringify(obj, null, 2)}\n`);

exports.run = () =>
  smoke().catch((e) => {
    save({ app: vscode.env.appName, version: vscode.version, error: String(e?.stack ?? e) });
    throw e;
  });

async function smoke() {
  const ext = vscode.extensions.getExtension("usegantry.gantry-vscode");
  if (!ext) throw new Error("extension not loaded");
  await withTimeout(ext.activate(), 30_000, "activation");
  await withTimeout(vscode.commands.executeCommand("gantry.scan"), 60_000, "scan");

  const diags = vscode.languages.getDiagnostics().flatMap(([uri, ds]) => ds.filter((d) => d.source === "Gantry").map((d) => ({ uri, d })));
  if (!diags.length) throw new Error("no Gantry diagnostics after scanning the vulnerable fixture");

  const first = diags.find(({ uri }) => uri.path.endsWith(".ts")) ?? diags[0];
  console.log(`[gantry-edh] ${diags.length} diagnostics; codelens on ${first.uri.toString()}`);
  const doc = await vscode.workspace.openTextDocument(first.uri);
  await vscode.window.showTextDocument(doc);
  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri, 100);
  const fixLenses = (lenses ?? []).filter((l) => l.command && l.command.command === "gantry.fixWithAgent");
  if (!fixLenses.length) throw new Error(`no "Fix with AI Agent" CodeLens on ${first.uri.path}`);

  console.log(`[gantry-edh] ${fixLenses.length} fix lenses`);
  // Fix with AI Agent: the prompt always lands on the clipboard; a host agent command may also open.
  await withTimeout(vscode.commands.executeCommand("gantry.fixWithAgent", ...fixLenses[0].command.arguments), 15_000, "fixWithAgent");
  const clip = await vscode.env.clipboard.readText();
  const want = fixLenses[0].command.arguments[0].ruleId;
  if (!clip.startsWith(`[${want}]`)) throw new Error(`clipboard holds "${clip.slice(0, 60)}", expected the ${want} prompt`);

  console.log("[gantry-edh] fix ok; opening sidebar");
  await vscode.commands.executeCommand("workbench.view.extension.gantry");
  const agentCommands = await vscode.commands.executeCommand("gantry.debugAgentCommands");
  const all = await vscode.commands.getCommands(true);
  const result = {
    app: vscode.env.appName,
    version: vscode.version,
    diagnostics: diags.length,
    files: new Set(diags.map(({ uri }) => uri.path)).size,
    codeLenses: fixLenses.length,
    clipboard: clip.split("\n")[0],
    sidebar: all.includes("gantry.sidebar.focus"),
    agentCommands,
  };
  save(result);
  console.log(`[gantry-edh] ${JSON.stringify({ ...result, agentCommands: agentCommands.length })}`);
}
