/** Dockerfile line scanner: joins `\` continuations, drops comments, splits into build stages. */
export type DockerInstr = { line: number; op: string; args: string };
export type DockerStage = { from: string; name?: string; line: number; instrs: DockerInstr[] };

export const DOCKERFILE_RE = /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.[\w.-]+)?$|\.Dockerfile$/i;

export function parseDockerfile(text: string): DockerStage[] {
  const stages: DockerStage[] = [];
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*(?:#|$)/.test(raw[i])) continue;
    const line = i + 1;
    let cmd = raw[i];
    while (/\\\s*$/.test(cmd) && i + 1 < raw.length) {
      cmd = cmd.replace(/\\\s*$/, " ");
      while (i + 1 < raw.length && /^\s*#/.test(raw[i + 1])) i++;
      if (i + 1 < raw.length) cmd += raw[++i];
    }
    const m = cmd.trim().match(/^(\w+)\s*(.*)$/s);
    if (!m) continue;
    const op = m[1].toUpperCase();
    const args = m[2].replace(/\s+/g, " ").trim();
    if (op === "FROM") {
      const [, from = "", name] = args.match(/^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i) ?? [];
      stages.push({ from, name, line, instrs: [] });
    } else stages.at(-1)?.instrs.push({ line, op, args });
  }
  return stages;
}
