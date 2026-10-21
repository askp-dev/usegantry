<script lang="ts">
  import type { PillarScore } from "../types";

  let { pillar }: { pillar: PillarScore } = $props();
  const tone = $derived(pillar.critical ? "block" : pillar.high ? "warn" : "ready");
</script>

<div class="card">
  <div class="label">{pillar.pillar}</div>
  <div class="score" style="color: var(--color-{tone})">{pillar.score}</div>
  <div class="code-ref text-muted">{pillar.critical} crit · {pillar.high} high · {pillar.medium} med</div>
</div>
