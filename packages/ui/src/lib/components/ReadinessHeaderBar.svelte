<script lang="ts">
  import { PILL, toneOf, type AuditReport } from "../types";

  export type Tab = "matrix" | "pentest" | "legal" | "finops";
  let { report, tab = $bindable(), onfixall, onexport }: { report: AuditReport | null; tab: Tab; onfixall: () => void; onexport: () => void } = $props();

  const TABS: Array<[Tab, string]> = [
    ["matrix", "Readiness Matrix"],
    ["pentest", "Live Pentest Console"],
    ["legal", "Legal & EULA Studio"],
    ["finops", "FinOps & Burn Simulator"],
  ];
  const badges = $derived(
    report ? [`${report.repo.framework}${report.repo.frameworkVersion ? ` ${report.repo.frameworkVersion.split(".")[0]}` : ""}`, ...report.repo.stack.filter((s) => s !== report.repo.framework)] : [],
  );
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      onfixall();
    }
  }}
/>

<header class="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-4 border-b border-subtle bg-glass px-4 backdrop-blur">
  <div class="flex items-center gap-2">
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--color-agent)" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z" /></svg>
    <strong class="font-mono">{report?.repo.name ?? "gantry"}</strong>
    {#each badges as b}<span class="code-ref rounded-full border border-subtle bg-surface-2 px-2 text-secondary">{b}</span>{/each}
    {#if report?.repo.gitCommitSha}<span class="code-ref rounded-full border border-subtle px-2 text-muted">{report.repo.gitCommitSha.slice(0, 7)}</span>{/if}
  </div>
  <div role="tablist" class="mx-auto flex gap-0.5 rounded-lg border border-subtle bg-surface-1 p-0.5">
    {#each TABS as [id, title]}
      <button role="tab" aria-selected={tab === id} class="rounded-md px-3 py-1.5 {tab === id ? 'bg-surface-2 text-primary' : 'text-secondary'}" onclick={() => (tab = id)}>{title}</button>
    {/each}
  </div>
  <div class="flex items-center gap-2">
    {#if report}
      <span class="code-ref rounded-full px-2.5 py-1 font-bold {PILL[toneOf(report.status)]}">{report.status.replace("_", " ")} • {report.score}/100</span>
    {/if}
    <button class="btn-agent" onclick={onfixall} disabled={!report}>✨ Fix All in Agent (⌘⇧F)</button>
    <button class="btn" onclick={onexport} disabled={!report}>📄 Export Certificate</button>
  </div>
</header>
