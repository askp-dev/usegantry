<script lang="ts">
  // Go/no-go board (DESIGN.md §5.2): one call per station, the number supports it.
  import { callOf, PILLARS, plural, STATION, type PillarKey } from "#lib/site.ts";
  import CallBlock from "./CallBlock.svelte";
  type P = { pillar: string; score: number; critical: number; high: number; medium: number };
  let { pillars, compact = false }: { pillars: P[]; compact?: boolean } = $props();
  const rows = $derived(PILLARS.map((k: PillarKey) => pillars.find((p) => p.pillar === k) ?? { pillar: k, score: 100, critical: 0, high: 0, medium: 0 }));
  const detail = (p: P) =>
    p.critical ? plural(p.critical, "tag") : p.high ? `${p.high} high` : p.medium ? `${p.medium} medium` : "clear";
</script>

<div class="grid grid-cols-2 border-y-2 border-ink sm:grid-cols-4" role="table" aria-label="Go/no-go poll">
  {#each rows as p, i (p.pillar)}
    <div role="row" class="flex flex-col gap-2 p-3 {i % 2 ? 'border-l' : ''} {i > 1 ? 'border-t sm:border-t-0' : ''} {i === 2 ? 'sm:border-l' : ''} border-rule">
      <span role="rowheader" class="label text-ink-2">{STATION[p.pillar as PillarKey]}</span>
      <span role="cell"><CallBlock call={callOf(p)} size={compact ? "sm" : "md"} /></span>
      <span role="cell" class="flex items-baseline gap-2">
        <span class="font-mono tabular {compact ? 'text-[22px]' : 'text-[34px]'} leading-none">{p.score}</span>
        <span class="text-[12px] text-ink-3">{detail(p)}</span>
      </span>
    </div>
  {/each}
</div>
