import { defineRule } from "../helpers";
import { kwarg, pyCalls, pyFiles, servesUsers } from "./py-helpers";

/** Tools / engines that execute model-written code or shell commands on the host. */
const EXEC_SINK =
  /(?:^|\.)(?:PythonREPLTool|PythonAstREPLTool|PythonREPL|BashProcess|ShellTool|create_python_agent|PandasQueryEngine|PolarsQueryEngine|CodeInterpreterToolSpec|PALChain|LLMBashChain)$/;
/** `load_tools([...])` names that load a REPL / shell tool. */
const DANGEROUS_TOOL_NAMES = /["'](?:python_repl|terminal|shell|bash)["']/;

export const py03AgentExecSinks = defineRule(
  { id: "PY-03", pillar: "SECURITY", severity: "HIGH", title: "LLM Agent Can Execute Code on the Host (LangChain / LlamaIndex Exec Sink)" },
  (ctx, emit) => {
    for (const file of pyFiles(
      ctx,
      /REPL|BashProcess|ShellTool|allow_dangerous_code|python_agent|QueryEngine|CodeInterpreter|PALChain|LLMBashChain|load_tools/,
    )) {
      const ci = ctx.getCode(file);
      const exposed = servesUsers(ci) || ctx.routes.some((r) => r.file === file);
      const severity = exposed ? "CRITICAL" : "HIGH";
      for (const call of pyCalls(ci, /./)) {
        let what: string | undefined;
        if (EXEC_SINK.test(call.qname)) what = `\`${call.qname.split(".").pop()}\` executes whatever code/commands the model writes`;
        else if (kwarg(ci, call, "allow_dangerous_code") === "True")
          what = `\`${call.qname.split(".").pop()}(..., allow_dangerous_code=True)\` lets the agent run model-written Python (it \`exec\`s/\`eval\`s generated pandas code)`;
        else if (/(?:^|\.)load_tools$/.test(call.qname) && DANGEROUS_TOOL_NAMES.test(ci.slice(call.openParen, call.closeParen, "noComments")))
          what = "`load_tools` loads a Python REPL / shell tool";
        if (!what) continue;
        emit({
          file,
          line: call.line,
          severity,
          evidence: ci.snippet(call.start),
          impact: `${what} in the server process, with its environment variables, cloud credentials, database and file system. A prompt injection (in the user's message, an uploaded CSV, a retrieved web page or document) is enough to make the model write \`os.system(...)\` or read \`os.environ\`.${exposed ? " This file serves untrusted users (web/chat framework or route), so the input is attacker-controlled." : ""}`,
          agentRemediationPrompt: `In ${file}:${call.line}, remove the host-execution tool. Run generated code only in an isolated sandbox (E2B, a gVisor/Firecracker microVM, or a locked-down container with no network, no secrets in env, a read-only FS and CPU/time limits) and pass results back as data. For dataframes, expose a fixed set of query tools (filter/aggregate with validated column names) instead of \`allow_dangerous_code=True\`.`,
        });
      }
    }
  },
);
