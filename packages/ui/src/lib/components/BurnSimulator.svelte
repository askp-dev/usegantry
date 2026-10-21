<script lang="ts">
  import type { AuditReport } from "../types";
  import FindingList from "./FindingList.svelte";

  let { report }: { report: AuditReport } = $props();
  let dau = $state(1000);
  let calls = $state(10);
  let tokens = $state(2000);
  let price = $state(5);
  const n = (v: number) => Math.max(0, Number(v) || 0);
  const monthly = $derived((n(dau) * n(calls) * n(tokens) * 30 * n(price)) / 1e6);
  const fin = $derived(report.findings.filter((f) => /^(FIN|PAY)-/.test(f.ruleId)));
  const unbounded = $derived(fin.filter((f) => f.ruleId === "FIN-01" || f.ruleId === "FIN-02").length);
</script>

<div class="card mb-4">
  <div class="label mb-2">Burn simulator</div>
  <div class="mb-3 flex flex-wrap gap-3">
    <label class="flex flex-col gap-1"><span class="text-secondary">Daily active users</span><input class="field" type="number" min="0" bind:value={dau} /></label>
    <label class="flex flex-col gap-1"><span class="text-secondary">AI calls / user / day</span><input class="field" type="number" min="0" bind:value={calls} /></label>
    <label class="flex flex-col gap-1"><span class="text-secondary">Tokens / call</span><input class="field" type="number" min="0" bind:value={tokens} /></label>
    <label class="flex flex-col gap-1"><span class="text-secondary">$ / 1M tokens</span><input class="field" type="number" min="0" step="0.01" bind:value={price} /></label>
  </div>
  <div class="score">${monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</div>
  <p class="text-muted">
    {unbounded ? `${unbounded} unbounded-spend finding(s): one abusive user can multiply this.` : "Spend caps detected on AI routes."}
  </p>
</div>
<FindingList findings={fin} />
