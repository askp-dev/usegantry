import { defineRule } from "../helpers";
import { evidenceOf, insideKind, lineOf, sysHandlers } from "./sys-helpers";

/** Concurrency caps in the handler: semaphores, errgroup.SetLimit, worker pools, bounded streams. */
const GO_BOUNDED = /\.SetLimit\(|semaphore\.|\.Acquire\(|\bsem\w*\s*<-|<-\s*\w*sem\w*\b|\b(?:pool|wp|workers?)\.(?:Submit|Invoke|Go)\(|\bants\./i;
const RUST_BOUNDED = /Semaphore|\.acquire(?:_owned|_many)?\(|\.try_acquire|buffer_unordered|for_each_concurrent/;
const RUST_SPAWN = /^(?:(?:tokio|actix_rt|async_std)::(?:task::)?)?spawn(?:_local)?$|^task::spawn(?:_local)?$/;

export const sys01UnboundedSpawn = defineRule(
  { id: "SYS-01", pillar: "FINOPS_OPS", severity: "HIGH", title: "Unbounded Goroutine / tokio::spawn Per Request", scope: "repo" },
  (ctx, emit) => {
    for (const lang of ["go", "rust"] as const) {
      for (const { route, fn } of sysHandlers(ctx, lang)) {
        const body = fn.text();
        if ((lang === "go" ? GO_BOUNDED : RUST_BOUNDED).test(body)) continue;
        const spawns =
          lang === "go"
            ? [
                ...fn.findAll({ rule: { kind: "go_statement" } }),
                // errgroup.Go without SetLimit is the same unbounded fan-out
                ...(/errgroup\./.test(ctx.getText(route.file))
                  ? fn.findAll({ rule: { kind: "call_expression" } }).filter((c) => /^\w+\.Go$/.test(c.field("function")?.text() ?? ""))
                  : []),
              ]
            : fn.findAll({ rule: { kind: "call_expression" } }).filter((c) => {
                const name = c.field("function")?.text() ?? "";
                return RUST_SPAWN.test(name) && (name !== "spawn" || /use\s+(?:tokio|async_std)::(?:task::)?\{?[^;]*\bspawn\b/.test(ctx.getText(route.file)));
              });
        for (const s of spawns) {
          const inLoop = insideKind(s, /^(for_statement|for_expression|while_expression|loop_expression)$/, fn);
          const what = lang === "go" ? "`go` statement" : `\`${s.field("function")?.text()}\``;
          emit({
            file: route.file,
            line: lineOf(s),
            nodeRef: `route:${route.method} ${route.urlPath}`,
            evidence: evidenceOf(s),
            impact: `The ${route.method} ${route.urlPath} handler starts a new ${lang === "go" ? "goroutine" : "task"} (${what})${inLoop ? " inside a loop over request data" : ""} on every request with no semaphore, limit or worker pool. A burst of traffic (or one client looping) spawns unbounded concurrent work: memory, DB connections and downstream API quotas run out, the pod is OOM-killed, and paid API calls multiply.`,
            agentRemediationPrompt:
              lang === "go"
                ? `In ${route.file}:${lineOf(s)}, bound the background work: hand jobs to a fixed worker pool over a buffered channel (reject with 503 when full), or acquire a shared \`golang.org/x/sync/semaphore.Weighted\` (\`TryAcquire\` → 429) before \`go\`; for fan-out use \`errgroup\` with \`g.SetLimit(n)\`. Derive the goroutine's context from \`context.WithoutCancel(r.Context())\` plus a timeout.`
                : `In ${route.file}:${lineOf(s)}, bound the spawned work: keep an \`Arc<tokio::sync::Semaphore>\` in app state and \`try_acquire_owned()\` before spawning (return 429/503 when exhausted), moving the permit into the task; or send jobs to a bounded \`mpsc::channel(n)\` worker. For fan-out over request data use \`futures::stream::iter(..).buffer_unordered(n)\`.`,
          });
        }
      }
    }
  },
);
