<script lang="ts">
  import type { Finding } from "../types";
  import FindingRow from "./FindingRow.svelte";

  let { findings, filterLabel = null, onclear }: { findings: Finding[]; filterLabel?: string | null; onclear?: () => void } = $props();
</script>

<div class="card">
  <div class="mb-2 flex items-center gap-2">
    <span class="label">Findings ({findings.length})</span>
    {#if filterLabel}
      <button class="code-ref rounded-full border border-subtle px-2" onclick={onclear}>{filterLabel} ✕</button>
    {/if}
  </div>
  {#each findings as f (f.fingerprint ?? `${f.ruleId}:${f.file}:${f.line}`)}
    <FindingRow finding={f} />
  {:else}
    <p class="text-muted">No findings{filterLabel ? " for this node" : ""}. 🚀</p>
  {/each}
</div>
