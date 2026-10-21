import type { YNode } from "../../context/yaml";
import { isMap, isSeq, str } from "../../context/yaml";
import { defineRule } from "../helpers";
import { type ComposeService, composeServices, imageName, scalars } from "./infra-helpers";

const DATA_IMAGE =
  /^(?:postgres(?:ql)?|postgis|pgvector|timescaledb(?:-ha)?|mysql(?:-server)?|mariadb|percona(?:-server)?|mongo(?:db)?(?:-community-server)?|redis(?:-stack(?:-server)?)?|valkey|keydb|dragonfly|memcached|qdrant|chroma|milvus|weaviate|elasticsearch|opensearch|clickhouse(?:-server)?|couchdb|couchbase|cassandra|scylla|neo4j|influxdb|meilisearch|typesense|rabbitmq|nats|kafka|minio|cockroach|surrealdb|etcd|zookeeper)$/;
/** Service names that mean "database" when the service is built locally (no image). */
const DATA_NAME = /^(?:db|database|postgres(?:ql)?|pg|mysql|mariadb|mongo(?:db)?|redis|valkey|cache|memcached|elasticsearch|qdrant|chroma)$/i;
const LOOPBACK = /^(?:127\.\d+\.\d+\.\d+|localhost|\[?::1\]?)$/i;
const TRUTHY = /^(?:1|true|yes|on)$/i;

/** Auth is switched off or missing, so the open port is directly exploitable. */
function noAuth(s: ComposeService, kind: string): boolean {
  const e = s.env;
  const cmd = `${scalars(s.node.command)} ${scalars(s.node.entrypoint)}`;
  if (/^postgres|^postgis|^pgvector|^timescale/.test(kind)) return /^trust$/i.test(e.POSTGRES_HOST_AUTH_METHOD ?? "");
  if (/^mysql|^mariadb|^percona/.test(kind))
    return [e.MYSQL_ALLOW_EMPTY_PASSWORD, e.MARIADB_ALLOW_EMPTY_ROOT_PASSWORD, e.ALLOW_EMPTY_PASSWORD].some(
      (v) => v !== undefined && (v === "" || TRUTHY.test(v)),
    );
  if (/^(?:redis|valkey|keydb|dragonfly)/.test(kind))
    return !/requirepass|--requirepass/.test(cmd) && !e.REDIS_PASSWORD && !e.VALKEY_PASSWORD && !e.REDIS_ARGS?.includes("requirepass");
  if (kind === "memcached") return true;
  if (/^mongo/.test(kind)) return !e.MONGO_INITDB_ROOT_PASSWORD && !e.MONGO_INITDB_ROOT_PASSWORD_FILE && !e.MONGODB_ROOT_PASSWORD;
  if (/^(?:elasticsearch|opensearch)$/.test(kind))
    return (
      /^false$/i.test(e["xpack.security.enabled"] ?? "") || TRUTHY.test(e.DISABLE_SECURITY_PLUGIN ?? "") || /^true$/i.test(e["plugins.security.disabled"] ?? "")
    );
  return false;
}

/** `${VAR:-default}` → default, `${VAR}` → `$VAR` (unknown host). */
const interpolate = (s: string) => s.replace(/\$\{[^}:]+:?-([^}]*)\}/g, "$1").replace(/\$\{([^}]+)\}/g, "$$$1");

/** Split on colons outside `${…}` and `[…]`. */
function splitColons(s: string): string[] {
  const out = [""];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[" || (c === "$" && s[i + 1] === "{")) depth++;
    else if ((c === "]" || c === "}") && depth) depth--;
    if (c === ":" && !depth) out.push("");
    else out[out.length - 1] += c;
  }
  return out;
}

/** Short-syntax port → the same spec bound to 127.0.0.1, or null when it's already loopback-only. */
export function fixShortPort(spec: string): string | null {
  const proto = spec.match(/\/\w+$/)?.[0] ?? "";
  const parts = splitColons(spec.slice(0, spec.length - proto.length));
  if (parts.length === 3 && LOOPBACK.test(interpolate(parts[0]))) return null;
  const [host, container] = parts.length === 1 ? ["", parts[0]] : parts.slice(-2);
  return `127.0.0.1:${host}:${container}${proto}`;
}

export const iac01PublicDataPorts = defineRule(
  { id: "IAC-01", pillar: "SECURITY", severity: "HIGH", title: "Database / Cache / Vector Port Published on All Interfaces" },
  (ctx, emit) => {
    for (const s of composeServices(ctx)) {
      const kind = s.image ? imageName(s.image) : s.node.build && DATA_NAME.test(s.name) ? s.name.toLowerCase() : "";
      if (!kind || (s.image && !DATA_IMAGE.test(kind))) continue;
      const severity = noAuth(s, kind) ? "CRITICAL" : "HIGH";
      const lines = ctx.getText(s.file).split("\n");
      const what = `\`${s.name}\` (${s.image ?? "local build"})`;
      const impact = `${what} is reachable on every network interface of the host. Docker publishes ports through its own iptables rules, which bypass ufw/firewalld, so on any VPS with a public IP the database is open to the internet${severity === "CRITICAL" ? " and authentication is disabled, so anyone can read or wipe it without a password" : " and only its password stands between scanners and your data"}.`;
      const emitPort = (node: YNode, replacementText: string | undefined, evidence: string) =>
        emit({
          file: s.file,
          line: node.line,
          severity,
          evidence,
          impact,
          agentRemediationPrompt: `In ${s.file}:${node.line}, bind the ${s.name} port to loopback (\`"127.0.0.1:<host>:<container>"\`), or remove \`ports:\` entirely and let the app reach it over the compose network by service name.`,
          ...(replacementText !== undefined ? { autoFixPatch: { startLine: node.line, endLine: node.line, replacementText } } : {}),
        });

      if (/^host$/i.test(str(s.node.network_mode) ?? "")) {
        const n = s.node.network_mode;
        emit({
          file: s.file,
          line: n.line,
          severity,
          evidence: `${s.name}: network_mode: host`,
          impact: `${impact} \`network_mode: host\` shares the host's network stack, so every port it listens on is public.`,
          agentRemediationPrompt: `In ${s.file}:${n.line}, remove \`network_mode: host\` from ${s.name}, put it on the default compose network, and publish nothing (or only \`127.0.0.1:\` ports).`,
        });
      }
      const ports = s.node.ports;
      if (!isSeq(ports)) continue;
      for (const p of ports.value) {
        const spec = str(p);
        if (spec !== undefined) {
          const fixed = fixShortPort(spec);
          if (!fixed) continue;
          const raw = lines[p.line - 1] ?? "";
          const quoted = new RegExp(`(["'])${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`).test(raw);
          const replacement = raw.includes(spec) ? raw.replace(spec, quoted ? fixed : `"${fixed}"`) : undefined;
          emitPort(p, replacement, `${s.name}:\n  image: ${s.image ?? "(build)"}\n  ports: - ${spec}`);
        } else if (isMap(p)) {
          const { host_ip, published, target } = p.value;
          if (host_ip && LOOPBACK.test(str(host_ip) ?? "")) continue;
          const anchor = host_ip ?? published ?? target;
          if (!anchor) continue;
          const raw = lines[anchor.line - 1] ?? "";
          const indent = raw.match(/^\s*(?:-\s*)?/)?.[0].replace("-", " ") ?? "";
          const replacement = host_ip ? raw.replace(/host_ip:.*$/, 'host_ip: "127.0.0.1"') : `${raw}\n${indent}host_ip: "127.0.0.1"`;
          emitPort(
            anchor,
            replacement,
            `${s.name}:\n  ports: - target: ${str(target) ?? "?"} published: ${str(published) ?? "(random)"} host_ip: ${str(host_ip) ?? "(all)"}`,
          );
        }
      }
    }
  },
);
