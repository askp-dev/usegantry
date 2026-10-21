<script lang="ts">
  import { legalApply, legalPreview, type LegalPreview } from "../api";
  import { PILL } from "../types";

  let data = $state<LegalPreview | null>(null);
  let error = $state("");
  let message = $state("");
  let busy = $state(false);

  async function load() {
    error = "";
    try {
      data = await legalPreview();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function commit() {
    if (!confirm("Write the generated legal blocks into legal/*.md and bump the legal version?")) return;
    busy = true;
    try {
      const r = await legalApply();
      message = `Wrote ${r.changes.length} file(s).`;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  const lineClass = (l: string) => (l.startsWith("+") && !l.startsWith("+++") ? "text-ready" : l.startsWith("-") && !l.startsWith("---") ? "text-block" : "");
  $effect(() => {
    load();
  });
</script>

<div class="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
  <aside class="card space-y-3">
    <div class="label">Detected sub-processors</div>
    {#each data?.manifest.subprocessors ?? [] as s (s.id)}
      <label class="flex gap-2"><input type="checkbox" checked disabled /> {s.entityName} <span class="text-muted">{s.category}</span></label>
    {:else}
      <p class="text-muted">None detected.</p>
    {/each}
    <div class="label">Active legal clauses</div>
    {#each data?.manifest.clauses ?? [] as c (c.id)}
      <label class="flex gap-2" title={c.reason}><input type="checkbox" checked={c.enabled} disabled /> {c.label}</label>
    {/each}
    <div class="label">Jurisdiction</div>
    <div class="text-secondary">{data?.manifest.jurisdiction ?? "—"}</div>
    <p class="text-muted text-xs">Clauses and jurisdiction come from the detected stack and <code>gantry.config</code>.</p>
  </aside>
  <div class="card">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button class="btn" onclick={load}>Refresh diff</button>
      <button class="btn-agent" onclick={commit} disabled={busy || !data?.changes.length}>Commit Legal Sync</button>
      <span class="text-muted">{message}</span>
    </div>
    {#if error}<p class="mb-3 rounded-md p-2 {PILL.block}">{error}</p>{/if}
    {#if data?.disclaimer}<p class="mb-3 rounded-md p-2 {PILL.warn}">⚠ {data.disclaimer}</p>{/if}
    {#each data?.changes ?? [] as c (c.path)}
      <div class="label mt-2">{c.path}</div>
      <pre class="code-ref overflow-auto rounded-md border border-subtle bg-surface-2 p-2.5">{#each c.diff.split("\n") as l}<span class={lineClass(l)}>{l}</span>{"\n"}{/each}</pre>
    {:else}
      {#if data}<p class="text-muted">Legal docs are in sync with the detected stack.</p>{/if}
    {/each}
  </div>
</div>
