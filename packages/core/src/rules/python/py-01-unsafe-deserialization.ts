import type { Severity } from "../../context/types";
import { defineRule } from "../helpers";
import { isRouteHandler, kwarg, pyCalls, pyFiles } from "./py-helpers";

const PICKLE_SINKS =
  /^(?:(?:c?[Pp]ickle|_pickle|dill|cloudpickle)\.(?:loads?|Unpickler)|joblib\.load|pandas\.read_pickle|jsonpickle\.decode|marshal\.loads?|shelve\.open)$/;
const SAFE_YAML_LOADER = /^(?:yaml\.)?(?:C?SafeLoader|BaseLoader)$/;
/** Argument text that comes from the network, a cache/queue or the request (CRITICAL instead of HIGH). */
const UNTRUSTED_SRC =
  /\brequest\b|\bUploadFile\b|\bfile\.(?:read|file)\b|\.(?:body|content|data|json|form|files)\b|\b(?:redis|cache|r|kv|queue|sqs|message|msg|payload|blob|s3|object)\b|\.get\(|\brequests?\.|\burlopen\b|\bhttpx\b|\bbase64\b|\bb64decode\b/i;

/** Major.minor of the resolved torch version, if known (≥2.6 defaults `weights_only=True`). */
function torchSafeByDefault(version: string | undefined): boolean {
  const m = version?.match(/(\d+)\.(\d+)/);
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 6)) && !/^[<~^]|,/.test(version!.trim());
}

export const py01UnsafeDeserialization = defineRule(
  { id: "PY-01", pillar: "SECURITY", severity: "HIGH", title: "Unsafe Deserialization of Models / Cached Objects (pickle, torch.load, yaml.load)" },
  (ctx, emit) => {
    const torchDefaultSafe = torchSafeByDefault(ctx.dependencies.get("pypi:torch")?.version);
    for (const file of pyFiles(ctx, /pickle|joblib|read_pickle|marshal|shelve|torch|yaml|numpy|np\./)) {
      const ci = ctx.getCode(file);
      const handlers = ci.functions().filter(isRouteHandler);
      const inHandler = (pos: number) => handlers.some((f) => pos >= f.bodyStart && pos <= f.bodyEnd);
      const sevFor = (args: string, pos: number): Severity => (UNTRUSTED_SRC.test(args) || inHandler(pos) ? "CRITICAL" : "HIGH");

      for (const call of pyCalls(ci, /^(?:c?[Pp]ickle|_pickle|dill|cloudpickle|joblib|pandas|jsonpickle|marshal|shelve|torch|yaml|numpy)\.\w+$/)) {
        const args = ci.slice(call.openParen + 1, call.closeParen, "noComments");
        let severity: Severity;
        let what: string;
        let fix: string;
        if (PICKLE_SINKS.test(call.qname)) {
          severity = sevFor(args, call.start);
          what = `\`${call.qname}()\` runs arbitrary code embedded in the byte stream (\`__reduce__\`)`;
          fix =
            "replace pickle-family serialization with a data-only format (`json`, `msgpack`, Pydantic `model_validate_json`, `safetensors` for tensors, `skops.io` for scikit-learn models). If pickle is unavoidable, only load bytes you produced and verify an HMAC over them (`hmac.compare_digest`) before unpickling.";
        } else if (call.qname === "torch.load") {
          const wo = kwarg(ci, call, "weights_only");
          if (wo === "True") continue;
          if (wo === undefined && torchDefaultSafe) continue;
          severity = wo === "False" ? "CRITICAL" : sevFor(args, call.start);
          what = `\`torch.load()\`${wo === "False" ? " with `weights_only=False`" : " without `weights_only=True`"} unpickles the checkpoint, so a malicious \`.pt\`/\`.bin\` file (e.g. downloaded from a model hub) executes code on load`;
          fix =
            "pass `weights_only=True` (or store weights as `.safetensors` and load them with `safetensors.torch.load_file`). Pin `torch>=2.6`, where `weights_only=True` is the default.";
        } else if (/^yaml\.(?:load|load_all|unsafe_load|unsafe_load_all|full_load|full_load_all)$/.test(call.qname)) {
          const positional = ci.args(call)[1];
          const loader = kwarg(ci, call, "Loader") ?? (positional && ci.slice(positional[0], positional[1], "noComments").trim());
          if (/^yaml\.(?:load|load_all)$/.test(call.qname) && loader && SAFE_YAML_LOADER.test(loader)) continue;
          severity = sevFor(args, call.start);
          what = `\`${call.qname}()\`${loader ? ` with \`${loader}\`` : " without `Loader=yaml.SafeLoader`"} can construct arbitrary Python objects (\`!!python/object/apply:os.system\`)`;
          fix = "use `yaml.safe_load(...)` (or `yaml.load(..., Loader=yaml.SafeLoader)`).";
        } else if (call.qname === "numpy.load" && kwarg(ci, call, "allow_pickle") === "True") {
          severity = sevFor(args, call.start);
          what = "`numpy.load(..., allow_pickle=True)` unpickles object arrays embedded in the `.npy`/`.npz` file";
          fix = "drop `allow_pickle=True` and save object data in a data-only format (JSON, Parquet, `safetensors`).";
        } else continue;
        emit({
          file,
          line: call.line,
          severity,
          evidence: ci.snippet(call.start),
          impact: `${what}. Anyone who can influence those bytes (an uploaded file, a poisoned cache or queue entry, a model pulled from a public hub, a writable bucket) gets remote code execution on the server with its credentials.${severity === "CRITICAL" ? " The data here comes from a request, cache, network or upload." : ""}`,
          agentRemediationPrompt: `In ${file}:${call.line}, ${fix}`,
        });
      }
    }
  },
);
