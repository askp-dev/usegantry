import { DOCKERFILE_RE, type DockerStage, parseDockerfile } from "../../context/dockerfile";
import { isMap, isSeq, str } from "../../context/yaml";
import { defineRule } from "../helpers";
import { builtDockerfile, composeServices, imageName, isRootUser } from "./infra-helpers";

/** Base images that already run as a non-root user. */
const NONROOT_BASE = /[:-]nonroot\b|^(?:docker\.io\/)?bitnami\//i;
/** Tools whose whole job is talking to the Docker API (they still deserve a socket proxy, but aren't the app). */
const SOCKET_TOOLS =
  /^(?:traefik|portainer(?:-ce|-ee)?|agent|watchtower|docker-socket-proxy|socket-proxy|cadvisor|dozzle|nginx-proxy|docker-gen|acme-companion|docker|gitlab-runner|actions-runner|github-runner|autoheal|diun|ofelia|docker-autoheal)$/;

/** Effective USER of a stage: its last USER, else the stage it builds FROM. */
function stageUser(stages: DockerStage[], i: number, depth = 0): { user?: string; line?: number } {
  const st = stages[i];
  const u = st.instrs.filter((x) => x.op === "USER").at(-1);
  if (u) return { user: u.args.replace(/^["']|["']$/g, ""), line: u.line };
  const parent = stages.findIndex((s, j) => j < i && s.name && s.name.toLowerCase() === st.from.toLowerCase());
  return parent >= 0 && depth < 8 ? stageUser(stages, parent, depth + 1) : {};
}

export const iac02RootContainer = defineRule(
  { id: "IAC-02", pillar: "SECURITY", severity: "HIGH", title: "Container Runs as Root or Mounts the Docker Socket" },
  (ctx, emit) => {
    const services = composeServices(ctx);
    // compose `user:` overrides the image's USER
    const composeUser = new Map<string, string>();
    for (const s of services) {
      const df = builtDockerfile(s);
      const u = str(s.node.user);
      if (df && u) composeUser.set(df, u);
    }
    // 1. Dockerfiles whose final stage runs as root
    for (const file of ctx.files.all) {
      if (!DOCKERFILE_RE.test(file) || /(?:^|\/)\.devcontainer\//.test(file)) continue;
      const stages = parseDockerfile(ctx.getText(file));
      const last = stages.length - 1;
      if (last < 0 || NONROOT_BASE.test(stages[last].from)) continue;
      const { user, line } = stageUser(stages, last);
      if (user !== undefined && !isRootUser(user)) continue;
      const override = composeUser.get(file);
      if (override !== undefined && !isRootUser(override)) continue;
      const at = line ?? stages[last].line;
      emit({
        file,
        line: at,
        evidence: `FROM ${stages[last].from}${stages[last].name ? ` AS ${stages[last].name}` : ""}\n${user !== undefined ? `USER ${user}` : "(no USER instruction: the process runs as root)"}`,
        impact:
          "The app process runs as root inside the container. Any RCE (a vulnerable dependency, an unsafe deserializer, a prompt-injected tool call) gets root in the container, can rewrite the app's code and secrets on disk, and is one kernel or runtime bug away from root on the host.",
        agentRemediationPrompt: `In ${file}:${at}, create an unprivileged user in the final stage and switch to it before CMD (e.g. \`RUN addgroup -S app && adduser -S app -G app\` then \`USER app\`, or \`USER node\` on official Node images), and \`COPY --chown=app:app\` the files it needs to write.`,
      });
    }
    // 2. compose: docker.sock, privileged, or explicit root in an app container
    for (const s of services) {
      if (s.image && SOCKET_TOOLS.test(imageName(s.image))) continue;
      const vols = s.node.volumes;
      for (const v of isSeq(vols) ? vols.value : []) {
        const src = str(v) ?? (isMap(v) ? str(v.value.source) : undefined) ?? "";
        if (!/docker\.sock\b/.test(src)) continue;
        emit({
          file: s.file,
          line: v.line,
          severity: "CRITICAL",
          evidence: `${s.name}:\n  volumes: - ${src}`,
          impact: `\`${s.name}\` mounts the Docker socket. Whoever controls that container (one RCE or SSRF-to-socket away) can start a privileged container with the host's / mounted, which is root on the host, even with \`:ro\` (read-only only blocks file writes, not API calls).`,
          agentRemediationPrompt: `In ${s.file}:${v.line}, remove the \`docker.sock\` mount from ${s.name}. If the app truly needs the Docker API, put \`tecnativa/docker-socket-proxy\` in front of it with only the endpoints it needs enabled.`,
        });
      }
      const priv = s.node.privileged;
      if (/^true$/i.test(str(priv) ?? ""))
        emit({
          file: s.file,
          line: priv.line,
          severity: "CRITICAL",
          evidence: `${s.name}:\n  privileged: true`,
          impact: `\`${s.name}\` runs privileged: it has every capability and every host device, so a compromise of the app is a compromise of the host.`,
          agentRemediationPrompt: `In ${s.file}:${priv.line}, remove \`privileged: true\` from ${s.name} and grant only the specific capability it needs with \`cap_add:\`.`,
        });
      const user = s.node.user;
      if (user && isRootUser(str(user) ?? ""))
        emit({
          file: s.file,
          line: user.line,
          evidence: `${s.name}:\n  user: ${str(user)}`,
          impact: `\`${s.name}\` is forced to run as root, overriding any non-root USER in its image, so an RCE in it runs as root.`,
          agentRemediationPrompt: `In ${s.file}:${user.line}, set \`user: "1000:1000"\` (or the image's unprivileged user) for ${s.name} instead of root.`,
        });
    }
  },
);
