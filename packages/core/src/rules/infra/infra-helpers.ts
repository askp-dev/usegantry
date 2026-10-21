import { dirname, join, normalize } from "node:path";
import type { RepoContext } from "../../context/types";
import { isMap, isSeq, parseYaml, str, type YMap, type YNode } from "../../context/yaml";

export const COMPOSE_RE = /(?:^|\/)(?:docker-)?compose[\w.-]*\.ya?ml$/;

export type ComposeService = { file: string; name: string; line: number; node: YMap; image?: string; env: Record<string, string> };

const cache = new WeakMap<RepoContext, ComposeService[]>();

/** Every service in every compose file (parsed once per context). */
export function composeServices(ctx: RepoContext): ComposeService[] {
  let out = cache.get(ctx);
  if (out) return out;
  out = [];
  for (const file of ctx.files.all) {
    if (!COMPOSE_RE.test(file)) continue;
    const services = (() => {
      try {
        const root = parseYaml(ctx.getText(file));
        return isMap(root) ? root.value.services : undefined;
      } catch {
        return undefined;
      }
    })();
    if (!isMap(services)) continue;
    for (const [name, svc] of Object.entries(services.value)) {
      if (!isMap(svc)) continue;
      out.push({ file, name, line: svc.line, node: svc.value, image: str(svc.value.image), env: envOf(svc.value.environment) });
    }
  }
  cache.set(ctx, out);
  return out;
}

function envOf(n: YNode | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  if (isMap(n)) for (const [k, v] of Object.entries(n.value)) env[k] = str(v) ?? "";
  else if (isSeq(n))
    for (const item of n.value) {
      const s = str(item);
      if (s) env[s.split("=")[0]] = s.includes("=") ? s.slice(s.indexOf("=") + 1) : "";
    }
  return env;
}

/** Last path segment of an image reference without tag/digest: `docker.io/bitnami/redis:7` → `redis`. */
export const imageName = (image: string) => (image.split("/").pop() ?? "").split(/[:@]/)[0].toLowerCase();

/** Repo-relative Dockerfile a compose service builds, if any. */
export function builtDockerfile(s: ComposeService): string | undefined {
  const b = s.node.build;
  if (!b) return;
  const base = dirname(s.file);
  const context = (isMap(b) ? str(b.value.context) : str(b)) ?? ".";
  const df = (isMap(b) && str(b.value.dockerfile)) || "Dockerfile";
  return normalize(join(base, context, df)).replace(/^\.\//, "");
}

/** All scalar strings under a node (command, args, …), joined. */
export function scalars(n: YNode | undefined): string {
  if (!n) return "";
  if (typeof n.value === "string") return n.value;
  return (Array.isArray(n.value) ? n.value : Object.values(n.value)).map(scalars).join(" ");
}

export const isRootUser = (u: string) => /^(?:root|0)(?::(?:root|0))?$/.test(u.trim());
