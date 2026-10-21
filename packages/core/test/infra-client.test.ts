import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "../src/bin/cli";
import { buildRepoContext } from "../src/context/builder";
import { parseDockerfile } from "../src/context/dockerfile";
import { isMap, isSeq, parseYaml, str } from "../src/context/yaml";
import { runAudit } from "../src/engine";
import { client01TauriScopes } from "../src/rules/client/client-01-tauri-scopes";
import { client02AsyncstorageTokens } from "../src/rules/client/client-02-asyncstorage-tokens";
import { fixShortPort, iac01PublicDataPorts } from "../src/rules/infra/iac-01-public-data-ports";
import { iac02RootContainer } from "../src/rules/infra/iac-02-root-container";
import { sov01TelemetryBeacons } from "../src/rules/infra/sov-01-telemetry-beacons";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pf-infra-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const run = async (rule: { run: (c: any) => any }, files: Record<string, string>) =>
  rule.run(await buildRepoContext(repo(files), { config: { offline: true } }));

describe("parseYaml", () => {
  test("maps, sequences, anchors/merge, flow, block scalars, comments", () => {
    const root = parseYaml(`x: &base
  restart: always
svc:
  <<: *base
  image: "redis:7" # comment
  tag: 'a # not a comment'
  cmd: [redis-server, "--requirepass", x]
  ports:
  - "1:1"
  - target: 2
    published: 3
  hc: |
    curl -f x
    echo
  env: {A: b}
`);
    expect(isMap(root)).toBe(true);
    const svc = (root as any).value.svc;
    expect(str(svc.value.restart)).toBe("always");
    expect(str(svc.value.image)).toBe("redis:7");
    expect(str(svc.value.tag)).toBe("a # not a comment");
    expect(svc.value.cmd.value.map(str)).toEqual(["redis-server", "--requirepass", "x"]);
    const ports = svc.value.ports;
    expect(isSeq(ports)).toBe(true);
    expect(str(ports.value[0])).toBe("1:1");
    expect(ports.value[0].line).toBe(9);
    expect(str(ports.value[1].value.published)).toBe("3");
    expect(ports.value[1].value.published.line).toBe(11);
    expect(str(svc.value.hc)).toBe("curl -f x\necho");
    expect(str(svc.value.env.value.A)).toBe("b");
  });
  test("empty / comment-only input", () => {
    expect(parseYaml("# nothing\n")).toBeNull();
  });
});

test("parseDockerfile joins continuations and splits stages", () => {
  const st = parseDockerfile("FROM node:20 AS build\nRUN a \\\n  # c\n  && b\nFROM --platform=linux/amd64 build\nUSER app\n");
  expect(st.map((s) => [s.from, s.name])).toEqual([
    ["node:20", "build"],
    ["build", undefined],
  ]);
  expect(st[0].instrs[0]).toEqual({ line: 2, op: "RUN", args: "a && b" });
  expect(st[1].instrs[0].op).toBe("USER");
});

describe("IAC-01", () => {
  test("fixShortPort", () => {
    expect(fixShortPort("5432")).toBe("127.0.0.1::5432");
    expect(fixShortPort("0.0.0.0:5432:5432/tcp")).toBe("127.0.0.1:5432:5432/tcp");
    expect(fixShortPort("[::]:5432:5432")).toBe("127.0.0.1:5432:5432");
    expect(fixShortPort("${PORT:-5432}:5432")).toBe("127.0.0.1:${PORT:-5432}:5432");
    expect(fixShortPort("127.0.0.1:5432:5432")).toBeNull();
    expect(fixShortPort("[::1]:5432:5432")).toBeNull();
    expect(fixShortPort("${BIND:-127.0.0.1}:5432:5432")).toBeNull();
  });
  test("applying every autoFixPatch makes the rule silent", async () => {
    const compose = `services:
  db:
    image: postgres:16
    ports:
      - 5432:5432
      - "0.0.0.0:5433:5432"
  cache:
    image: bitnami/redis:7
    environment:
      REDIS_PASSWORD: x
    ports:
      - target: 6379
        host_ip: 0.0.0.0
  search:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    ports:
      - target: 9200
        published: 9200
`;
    const dir = repo({ "docker-compose.yml": compose });
    const fs = await iac01PublicDataPorts.run(await buildRepoContext(dir, { config: { offline: true } }));
    expect(fs.length).toBe(4);
    expect(fs.every((f) => f.autoFixPatch)).toBe(true);
    const lines = compose.split("\n");
    for (const f of [...fs].sort((a, b) => b.autoFixPatch!.startLine - a.autoFixPatch!.startLine))
      lines.splice(f.autoFixPatch!.startLine - 1, 1, f.autoFixPatch!.replacementText);
    writeFileSync(join(dir, "docker-compose.yml"), lines.join("\n"));
    expect(readFileSync(join(dir, "docker-compose.yml"), "utf8")).toContain('host_ip: "127.0.0.1"');
    expect(await iac01PublicDataPorts.run(await buildRepoContext(dir, { config: { offline: true } }))).toEqual([]);
  });
  test("severity: CRITICAL without auth, HIGH with it; app containers and expose are ignored", async () => {
    const fs = await run(iac01PublicDataPorts, {
      "compose.yaml": `services:
  cache:
    image: memcached:1.6
    ports: ["11211:11211"]
  pg:
    image: postgres:16
    environment: [POSTGRES_PASSWORD=x]
    ports: ["5432:5432"]
  api:
    image: myorg/api:1
    ports: ["8080:8080"]
  redis:
    image: redis:7
    expose: ["6379"]
  mongo:
    image: mongo:7
    network_mode: host
`,
    });
    expect(fs.map((f: any) => [f.evidence.split(":")[0], f.severity])).toEqual([
      ["cache", "CRITICAL"],
      ["pg", "HIGH"],
      ["mongo", "CRITICAL"],
    ]);
  });
});

describe("IAC-02", () => {
  test("inherits USER from the parent stage; trailing USER root fires; nonroot bases pass", async () => {
    expect(await run(iac02RootContainer, { Dockerfile: "FROM node:20 AS base\nUSER node\nFROM base\nCMD x\n" })).toEqual([]);
    expect(await run(iac02RootContainer, { Dockerfile: "FROM gcr.io/distroless/nodejs20-debian12:nonroot\nCMD x\n" })).toEqual([]);
    expect(await run(iac02RootContainer, { ".devcontainer/Dockerfile": "FROM node:20\n" })).toEqual([]);
    const fs = await run(iac02RootContainer, { "api/Dockerfile": "FROM node:20\nUSER node\nRUN x\nUSER 0\n" });
    expect(fs.map((f: any) => f.line)).toEqual([4]);
  });
  test("compose: user override clears, privileged / root user fire", async () => {
    const fs = await run(iac02RootContainer, {
      "app/Dockerfile": "FROM node:20\nCMD x\n",
      "docker-compose.yml": `services:
  app:
    build: ./app
    user: "1000"
  admin:
    image: myorg/admin
    privileged: true
    user: root
`,
    });
    expect(fs.map((f: any) => [f.line, f.severity])).toEqual([
      [7, "CRITICAL"],
      [8, "HIGH"],
    ]);
  });
});

describe("SOV-01 (profile airgap)", () => {
  test("runs only with the profile or an explicit rule id", async () => {
    const ctx = await buildRepoContext("fixtures/vulnerable-infra", { config: { offline: true } });
    const ids = (r: Awaited<ReturnType<typeof runAudit>>) => r.findings.filter((f) => f.ruleId === "SOV-01").length;
    expect(ids(await runAudit(ctx))).toBe(0);
    expect(ids(await runAudit(ctx, { ruleIds: ["SOV-01"] }))).toBeGreaterThan(0);
    const air = await buildRepoContext("fixtures/vulnerable-infra", { config: { offline: true, profiles: ["airgap"] } });
    expect(ids(await runAudit(air))).toBeGreaterThan(0);
  });
  test("--profile parses as a value flag", () => {
    expect(parseArgs(["scan", "--profile", "airgap", "."]).flags.profile).toBe("airgap");
  });
  test("self-hosted Sentry DSN and LangSmith endpoint clear the beacon", async () => {
    const fs = await run(sov01TelemetryBeacons, {
      "package.json": JSON.stringify({ dependencies: { "@sentry/node": "8.0.0" } }),
      ".env": "SENTRY_DSN=https://k@glitchtip.internal/1\nLANGSMITH_TRACING=true\nLANGSMITH_ENDPOINT=https://smith.internal\n",
    });
    expect(fs).toEqual([]);
  });
});

describe("CLIENT-01 / CLIENT-02", () => {
  test("v1 http wildcard scope and v2 inline capability in tauri.conf.json", async () => {
    const fs = await run(client01TauriScopes, {
      "src-tauri/tauri.conf.json": JSON.stringify(
        {
          tauri: { allowlist: { http: { scope: ["https://**"] } }, security: { csp: "default-src 'self'" } },
          app: { security: { capabilities: [{ identifier: "x", permissions: [{ identifier: "http:default", allow: [{ url: "*" }] }] }] } },
        },
        null,
        2,
      ),
    });
    expect(fs.map((f: any) => f.severity)).toEqual(["HIGH", "HIGH"]);
    expect(fs[0].impact).not.toContain("no CSP");
  });
  test("aliased AsyncStorage import; non-secret keys pass", async () => {
    const fs = await run(client02AsyncstorageTokens, {
      "lib/s.ts": `import Store from "@react-native-async-storage/async-storage";
export const a = () => Store.setItem("onboarded", "1");
export const b = (jwt: string) => Store.setItem(KEY, jwt);
`,
    });
    expect(fs.map((f: any) => f.line)).toEqual([3]);
  });
});
